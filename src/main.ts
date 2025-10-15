import { setupL10N, t } from "./libs/l10n";
import zhCN from "./translations/zhCN";
import enUS from "./translations/enUS";
import type { Block, DbId } from "./orca.d";

let pluginName: string;
let daysContainer: HTMLElement | null = null;
let clickHandler: ((e: Event) => void) | null = null;
let calendarCheckInterval: number | null = null;
let lastSelectedYear: string = '';
let lastSelectedMonth: string = '';
// Store week selections for each page (year-month combination)
let weekSelections: Record<string, string> = {};
let isCalendarVisible: boolean = true;
let lastFocusedBlockId: string | null = null;
// Track which weeks have journal dots to avoid repeated DOM operations
let weeksWithJournalDots: Set<string> = new Set();
let lastCheckedYear: string = '';
let lastCheckedMonth: string = '';

export async function load(_name: string) {
  pluginName = _name;

  setupL10N(orca.state.locale, { "zh-CN": zhCN, "en-US": enUS });

  // Inject CSS styles
  orca.themes.injectCSSResource("styles/calendar.css", `${pluginName}-styles`);

  // Setup week click handler
  setupWeekClickHandler();

  // Setup panel state monitoring
  setupPanelStateMonitoring();

  console.log(`${pluginName} loaded.`);
}

export async function unload() {
  // Remove event listener
  if (daysContainer && clickHandler) {
    daysContainer.removeEventListener("click", clickHandler);
  }

  // Clear calendar check interval
  if (calendarCheckInterval) {
    clearInterval(calendarCheckInterval);
    calendarCheckInterval = null;
  }

  // Remove CSS styles
  orca.themes.removeCSSResources(`${pluginName}-styles`);
}

/**
 * Setup event listener for week elements
 */
function setupWeekClickHandler() {
  // Use more specific selector to avoid conflicts
  daysContainer = document.querySelector(".orca-calendar .days");

  if (!daysContainer) {
    console.warn(`${pluginName}: .days container not found`);
    return;
  }

  // Event delegation for week clicks
  clickHandler = (e: Event) => {
    const target = e.target as HTMLElement;
    if (target && target.classList.contains("week")) {
      handleWeekClick(target);
    } else {
      // Clear .value class when clicking on other calendar elements
      clearWeekSelection();
    }
  };

  daysContainer.addEventListener("click", clickHandler);
  
  // Initialize calendar navigation state
  setupCalendarNavigationListeners();
}

/**
 * Clear all week selections (only .week elements)
 */
function clearWeekSelection() {
  if (daysContainer) {
    const weekElements = daysContainer.querySelectorAll(".week.value");
    weekElements.forEach((weekElement) => weekElement.classList.remove("value"));
  }
}

/**
 * Save current week selection for the given page
 */
function saveWeekSelection(year: string, month: string, week: string) {
  const pageKey = `${year}-${month}`;
  weekSelections[pageKey] = week;
}

/**
 * Restore week selection for the given page
 */
function restoreWeekSelection(year: string, month: string) {
  const pageKey = `${year}-${month}`;
  const savedWeek = weekSelections[pageKey];
  
  if (savedWeek && daysContainer) {
    // Find the week element with the saved week number
    const weekElements = daysContainer.querySelectorAll(".week");
    weekElements.forEach((weekElement) => {
      if (weekElement.textContent?.trim() === savedWeek) {
        weekElement.classList.add("value");
      }
    });
  }
}

/**
 * Handle click on week element
 */
async function handleWeekClick(weekElement: HTMLElement) {
  // Clear all existing week selections first
  clearWeekSelection();

  // Add 'value' class to clicked week element
  weekElement.classList.add("value");

  // Get year, month and week number
  const year = getYearFromCalendar();
  const month = getMonthFromCalendar();
  const week = weekElement.textContent?.trim() || "";

  if (!week) {
    console.warn(`${pluginName}: Week number not found`);
    return;
  }

  // Save the selection for this page
  saveWeekSelection(year, month, week);

  // Create or open week page
  await createOrOpenWeekPage(year, week);
}

/**
 * Setup panel state monitoring to detect when user leaves calendar view
 */
function setupPanelStateMonitoring() {
  // Check calendar visibility periodically
  calendarCheckInterval = setInterval(() => {
    checkCalendarVisibility();
  }, 300) as unknown as number; // Check every 300ms
}

/**
 * Check if calendar is visible and manage selections based on focused block
 */
function checkCalendarVisibility() {
  const calendarContainer = document.querySelector("#sidebar > div.orca-calendar");
  const currentlyVisible = calendarContainer && isElementVisible(calendarContainer);
  
  // If calendar became invisible, clear all selections
  if (isCalendarVisible && !currentlyVisible) {
    clearWeekSelection();
    // Don't clear weekSelections to preserve state when returning
  }
  
  // If calendar became visible again, restore selections based on current focused block
  if (!isCalendarVisible && currentlyVisible) {
    updateWeekSelectionBasedOnFocusedBlock();
    updateJournalDots();
  }
  
  // Always check for focused block changes when calendar is visible
  if (currentlyVisible) {
    updateWeekSelectionBasedOnFocusedBlock();
    // Only update journal dots when calendar becomes visible or page changes
    // (updateJournalDots has its own change detection)
    updateJournalDots();
  }
  
  isCalendarVisible = currentlyVisible || false;
}

/**
 * Check if an element is visible in the viewport
 */
function isElementVisible(element: Element): boolean {
  const rect = element.getBoundingClientRect();
  const style = window.getComputedStyle(element);
  
  return (
    rect.width > 0 &&
    rect.height > 0 &&
    style.display !== 'none' &&
    style.visibility !== 'hidden' &&
    style.opacity !== '0'
  );
}

/**
 * Get current focused block ID from active panel
 */
function getCurrentFocusedBlockId(): string | null {
  try {
    const activePanelId = orca.state.activePanel;
    const activePanel = findViewPanel(activePanelId, orca.state.panels);
    
    if (activePanel && activePanel.view === "block" && activePanel.viewArgs.blockId) {
      return activePanel.viewArgs.blockId.toString();
    }
  } catch (error) {
    console.warn(`${pluginName}: Error getting focused block ID:`, error);
  }
  
  return null;
}

/**
 * Find a view panel by ID in the panel structure
 */
function findViewPanel(id: string, panels: any): any {
  if (panels.id === id && panels.type === "view") {
    return panels;
  }
  
  if (panels.children) {
    for (const child of panels.children) {
      const found = findViewPanel(id, child);
      if (found) return found;
    }
  }
  
  return null;
}

/**
 * Check if a block ID corresponds to a weekly note alias
 */
function isWeeklyNoteBlock(blockId: string): { year: string; week: string } | null {
  try {
    const block = orca.state.blocks[blockId];
    if (!block) return null;
    
    // Check if this block has aliases that match weekly note pattern
    if (block.aliases && block.aliases.length > 0) {
      for (const alias of block.aliases) {
        // Match pattern: "43周 · 2025年10月"
        const match = alias.match(/^(\d+)周 · (\d{4})年(\d+)月$/);
        if (match) {
          return { year: match[2], week: match[1] };
        }
      }
    }
  } catch (error) {
    console.warn(`${pluginName}: Error checking weekly note block:`, error);
  }
  
  return null;
}

/**
 * Update week selection based on currently focused block
 */
function updateWeekSelectionBasedOnFocusedBlock() {
  const currentBlockId = getCurrentFocusedBlockId();
  
  // Only update if focused block changed
  if (currentBlockId === lastFocusedBlockId) return;
  
  lastFocusedBlockId = currentBlockId;
  
  // Clear all current week selections
  clearWeekSelection();
  
  if (!currentBlockId) return;
  
  // Check if current block is a weekly note
  const weeklyInfo = isWeeklyNoteBlock(currentBlockId);
  if (!weeklyInfo) return;
  
  // Check if this weekly note corresponds to current calendar page
  const currentYear = getYearFromCalendar();
  const currentMonth = getMonthFromCalendar();
  
  if (weeklyInfo.year === currentYear) {
    // Find and highlight the corresponding week element
    if (daysContainer) {
      const weekElements = daysContainer.querySelectorAll(".week");
      weekElements.forEach((weekElement) => {
        if (weekElement.textContent?.trim() === weeklyInfo.week) {
          weekElement.classList.add("value");
        }
      });
    }
  }
}

/**
 * Update journal dots for all weeks that have corresponding weekly note blocks
 * Only updates DOM when necessary to avoid repeated operations
 */
async function updateJournalDots() {
  if (!daysContainer) return;
  
  const currentYear = getYearFromCalendar();
  const currentMonth = getMonthFromCalendar();
  
  // Only update if year or month changed
  if (currentYear === lastCheckedYear && currentMonth === lastCheckedMonth) {
    return;
  }
  
  lastCheckedYear = currentYear;
  lastCheckedMonth = currentMonth;
  
  // Clear tracking set for new page
  weeksWithJournalDots.clear();
  
  const weekElements = daysContainer.querySelectorAll(".week");
  
  // Remove existing journal dots
  weekElements.forEach((weekElement) => {
    const existingDot = weekElement.querySelector(".journal-dot");
    if (existingDot) {
      existingDot.remove();
    }
  });
  
  // Add journal dots for weeks that have corresponding blocks
  for (const weekElement of weekElements) {
    const weekNumber = weekElement.textContent?.trim();
    if (!weekNumber) continue;
    
    // Construct alias name: "43周 · 2025年10月"
    const currentMonth = getMonthFromCalendar();
    const aliasName = `${weekNumber}周 · ${currentYear}年${currentMonth}月`;
    
    try {
      // Check if a block with this alias exists
      const block = await orca.invokeBackend("get-block-by-alias", aliasName);
      if (block && block.id) {
        // Add journal dot
        const dot = document.createElement("div");
        dot.className = "journal-dot";
        weekElement.appendChild(dot);
        
        // Track this week as having a journal dot
        weeksWithJournalDots.add(weekNumber);
      }
    } catch (error) {
      console.warn(`${pluginName}: Error checking block for alias ${aliasName}:`, error);
    }
  }
}

/**
 * Setup listeners for calendar navigation (month/year changes)
 * Monitor changes in year and month to manage week selections
 */
function setupCalendarNavigationListeners() {
  // Initialize current year and month
  lastSelectedYear = getYearFromCalendar();
  lastSelectedMonth = getMonthFromCalendar();
  
  // Initialize based on current focused block
  updateWeekSelectionBasedOnFocusedBlock();
  updateJournalDots();
  
  // The calendar navigation monitoring is now handled by checkCalendarVisibility
}

/**
 * Get month from calendar header
 */
function getMonthFromCalendar(): string {
  const monthElement = document.querySelector(
    "#sidebar > div.orca-calendar > header > div.choosen-month"
  );

  if (monthElement && monthElement.textContent) {
    // Remove "月" character and get the month number
    return monthElement.textContent.replace("月", "").trim();
  }

  // Fallback to current month
  return (new Date().getMonth() + 1).toString();
}

/**
 * Get year from calendar header
 */
function getYearFromCalendar(): string {
  const yearElement = document.querySelector(
    "#sidebar > div.orca-calendar > header > div.choosen-year"
  );

  if (yearElement && yearElement.textContent) {
    // Remove "年" character and get the year number
    return yearElement.textContent.replace("年", "").trim();
  }

  // Fallback to current year
  return new Date().getFullYear().toString();
}

/**
 * Create or open week page
 */
async function createOrOpenWeekPage(year: string, week: string) {
  try {
    // Get current month for the alias format
    const month = getMonthFromCalendar();
    
    // Construct alias name: "43周 · 2025年10月"
    const aliasName = `${week}周 · ${year}年${month}月`;

    // Check if page already exists
    const existingBlock = await orca.invokeBackend(
      "get-block-by-alias",
      aliasName
    );

    if (existingBlock && existingBlock.id) {
      // Page exists, navigate to it
      orca.nav.goTo("block", { blockId: existingBlock.id });
      orca.notify("info", t("weekPageOpened"));
      return;
    }

    // Page doesn't exist, create it
    const newBlockId = await createWeekPage(aliasName);

    if (newBlockId) {
      // Navigate to the new page
      orca.nav.goTo("block", { blockId: newBlockId });
      orca.notify("success", t("weekPageCreated"));
    }
  } catch (error) {
    console.error(`${pluginName}: Error creating/opening week page:`, error);
    orca.notify("error", t("createWeekPageError"));
  }
}

/**
 * Create a new week page with alias and tag
 */
async function createWeekPage(aliasName: string): Promise<DbId | null> {
  try {
    // Create a top-level block (parent: null means root level)
    // Create empty content initially
    const newBlockId = await orca.commands.invokeEditorCommand(
      "core.editor.insertBlock",
      null, // cursor
      null, // refBlock (null for root level)
      null, // position
      [{ t: "t", v: "" }], // empty content
      { type: "text" } // repr
    );

    if (!newBlockId) {
      throw new Error("Failed to create block");
    }

    // Create alias for the block
    const aliasError = await orca.commands.invokeEditorCommand(
      "core.editor.createAlias",
      null,
      aliasName,
      newBlockId
    );

    if (aliasError) {
      console.error(`${pluginName}: Error creating alias:`, aliasError);
      // Continue anyway, the block is created
    }

    // Add "周记" tag (will auto-create tag if it doesn't exist)
    const tagName = t("weeklyNoteTag");
    await orca.commands.invokeEditorCommand(
      "core.editor.insertTag",
      null,
      newBlockId,
      tagName
    );

    return newBlockId;
  } catch (error) {
    console.error(`${pluginName}: Error in createWeekPage:`, error);
    return null;
  }
}
