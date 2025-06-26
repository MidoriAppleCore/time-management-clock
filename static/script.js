let chartContainer;
let dayLineContainer;
let currentTimeBlock = null;
let currentSessionStart = null;  // new global variable
let baseOverallMinutes = 0;      // new global variable
let baseOverallEarnings = 0;     // new global variable
let baseDailyTotals = {};        // new global object for daily totals
let baseWeeklyTotals = {};       // new global object for weekly totals

// Initialize containers
function initializeContainers() {
    dayLineContainer = document.querySelector('.day-line-container');
}

// Create Hour Timeline
function createHourTimeline() {
    const hourTimeline = document.querySelector('.hour-timeline');
    hourTimeline.innerHTML = '';
    
    // Create hour markers from 0 to 24
    for (let i = 0; i <= 24; i += 2) {  // Changed to every 2 hours for less clutter
        const marker = document.createElement('div');
        marker.className = 'hour-marker';
        marker.style.left = `${(i / 24) * 100}%`;
        marker.textContent = formatHour(i);
        hourTimeline.appendChild(marker);
    }
}

// Format hour for timeline
function formatHour(hour) {
    const ampm = hour >= 12 ? 'PM' : 'AM';
    const formattedHour = hour % 12 === 0 ? 12 : hour % 12;
    return `${formattedHour} ${ampm}`;
}

// Find Current Clock-In Session
function findCurrentClockInSession(timelines) {
    // Iterate over all days to find any ongoing sessions
    for (const day in timelines) {
        const sessions = timelines[day];
        for (const session of sessions) {
            if (session.clockIn && !session.clockOut) {
                return { day: day, ...session };
            }
        }
    }
    return null;
}

// Add Day Line
function addDayLine(day, startTime, endTime, note, isCurrent = false) {
    let dayLine = document.getElementById(`day-line-${day}`);
    if (!dayLine) {
        dayLine = document.createElement('div');
        dayLine.className = 'day-line';
        dayLine.id = `day-line-${day}`;
        dayLineContainer.appendChild(dayLine);

        const dayLabel = document.createElement('div');
        dayLabel.className = 'day-label';
        dayLabel.textContent = day;
        dayLine.appendChild(dayLabel);
    }

    const startPercent = (startTime.getHours() + startTime.getMinutes() / 60) / 24 * 100;
    const endPercent = endTime ? (endTime.getHours() + endTime.getMinutes() / 60) / 24 * 100 : (new Date().getHours() + new Date().getMinutes() / 60) / 24 * 100;

    const timeBlock = document.createElement('div');
    timeBlock.className = 'time-block' + (isCurrent ? ' highlighted' : '');
    timeBlock.style.left = `${startPercent}%`;
    timeBlock.style.width = `${endPercent - startPercent}%`;
    timeBlock.title = `Note: ${note || 'N/A'}\nStart: ${formatTimeForDisplay(startTime)}\nEnd: ${endTime ? formatTimeForDisplay(endTime) : 'Ongoing'}`;

    // Tooltip handling
    timeBlock.addEventListener('mouseover', (event) => showTooltip(event, note, startTime, endTime));
    timeBlock.addEventListener('mouseout', hideTooltip);

    // Save reference for ongoing session to update in real time
    if (isCurrent) {
        timeBlock.dataset.startTime = startTime.toISOString();
        timeBlock.dataset.note = note;
        currentTimeBlock = timeBlock;
        currentSessionStart = startTime;
    }
    
    dayLine.appendChild(timeBlock);

    return timeBlock;
}

// Show Tooltip
function showTooltip(event, note, startTime, endTime) {
    const tooltip = document.getElementById('tooltip');
    tooltip.innerHTML = `Note: ${note || 'N/A'}<br>Start: ${formatTimeForDisplay(startTime)}<br>End: ${endTime ? formatTimeForDisplay(endTime) : 'Ongoing'}`;
    
    let tooltipX = event.pageX + 10;
    let tooltipY = event.pageY + 10;

    // Temporarily display tooltip to get its dimensions
    tooltip.style.display = 'block';
    tooltip.style.left = `${tooltipX}px`;
    tooltip.style.top = `${tooltipY}px`;
    tooltip.classList.add('show');

    const tooltipWidth = tooltip.offsetWidth;
    const tooltipHeight = tooltip.offsetHeight;
    const windowWidth = window.innerWidth;
    const windowHeight = window.innerHeight;

    // Adjust position if tooltip goes beyond window boundaries
    if (tooltipX + tooltipWidth > window.scrollX + windowWidth) {
        tooltipX = event.pageX - tooltipWidth - 10;
    }

    if (tooltipY + tooltipHeight > window.scrollY + windowHeight) {
        tooltipY = event.pageY - tooltipHeight - 10;
    }

    tooltip.style.left = `${tooltipX}px`;
    tooltip.style.top = `${tooltipY}px`;
}

// Hide Tooltip
function hideTooltip() {
    const tooltip = document.getElementById('tooltip');
    tooltip.classList.remove('show');
    tooltip.style.display = 'none';
}

// Fetch Data from Server
async function fetchData() {
    try {
        const response = await fetch('/data');
        if (!response.ok) {
            throw new Error('Failed to fetch data.');
        }
        return await response.json();
    } catch (error) {
        showMessage(error.message, true);
        return [];
    }
}

// Show Message
function showMessage(message, isError = false) {
    const messageBox = document.getElementById('error-message');
    messageBox.textContent = message;
    if (isError) {
        messageBox.style.backgroundColor = '#f8d7da';
        messageBox.style.color = '#721c24';
        messageBox.style.borderColor = '#f5c6cb';
    } else {
        messageBox.style.backgroundColor = '#d4edda';
        messageBox.style.color = '#155724';
        messageBox.style.borderColor = '#c3e6cb';
    }
    messageBox.classList.add('show');
    setTimeout(() => {
        messageBox.classList.remove('show');
    }, 3000);
}

// Process Data
function processData(data) {
    const timelines = {};
    const minutesWorked = {};
    const earnings = {};
    const notesPerDay = {};
    const dayLabels = [];

    const payRate = parseFloat(localStorage.getItem('payRate')) || 21.0;

    let openSessions = [];

    data.forEach(entry => {
        const date = new Date(entry.Time); // Interpreting as local time

        if (entry.Action === 'Clock In') {
            openSessions.push({ clockIn: date, clockOut: null, note: entry.Note });
        } else if (entry.Action === 'Clock Out') {
            if (openSessions.length === 0) {
                // Handle error: Clock Out without Clock In
                console.warn('Clock Out without Clock In detected.');
                return;
            }
            const lastSession = openSessions.pop();
            lastSession.clockOut = date;

            // Split session if it crosses midnight
            const sessions = splitSessionAtMidnight(lastSession);

            sessions.forEach(session => {
                const clockInDate = session.clockIn.toLocaleDateString('en-CA'); // 'YYYY-MM-DD'
                const clockOutDate = session.clockOut.toLocaleDateString('en-CA'); // 'YYYY-MM-DD'

                // Since sessions are split at midnight, clockInDate and clockOutDate should be the same
                const dateString = clockInDate;

                if (!timelines[dateString]) {
                    timelines[dateString] = [];
                    minutesWorked[dateString] = 0;
                    earnings[dateString] = 0;
                    notesPerDay[dateString] = new Set();
                    dayLabels.push(dateString);
                }

                timelines[dateString].push({
                    clockIn: session.clockIn,
                    clockOut: session.clockOut,
                    note: session.note
                });

                const duration = (session.clockOut - session.clockIn) / (1000 * 60); // duration in minutes
                minutesWorked[dateString] += duration;
                earnings[dateString] += (duration / 60) * payRate;
                if (session.note && session.note !== 'null') { // Ignore 'null' notes
                    notesPerDay[dateString].add(session.note);
                }
            });
        }
    });

    // Handle any open sessions (ongoing sessions without Clock Out)
    openSessions.forEach(session => {
        const now = new Date();

        // Split session if it crosses midnight
        const sessions = splitSessionAtMidnight({ ...session, clockOut: now });

        sessions.forEach(session => {
            const clockInDate = session.clockIn.toLocaleDateString('en-CA'); // 'YYYY-MM-DD'
            const clockOutDate = session.clockOut.toLocaleDateString('en-CA'); // 'YYYY-MM-DD'

            // Since sessions are split at midnight, clockInDate and clockOutDate should be the same
            const dateString = clockInDate;

            if (!timelines[dateString]) {
                timelines[dateString] = [];
                minutesWorked[dateString] = 0;
                earnings[dateString] = 0;
                notesPerDay[dateString] = new Set();
                dayLabels.push(dateString);
            }

            timelines[dateString].push({
                clockIn: session.clockIn,
                clockOut: null, // Ongoing session
                note: session.note
            });

            // We don't add to minutesWorked or earnings for ongoing sessions
            if (session.note && session.note !== 'null') { // Ignore 'null' notes
                notesPerDay[dateString].add(session.note);
            }
        });
    });

    // Convert Set to Array for notes
    for (const day in notesPerDay) {
        notesPerDay[day] = Array.from(notesPerDay[day]);
    }

    return { timelines, minutesWorked, earnings, dayLabels, notesPerDay };
}

// Function to split sessions at midnight
function splitSessionAtMidnight(session) {
    const { clockIn, clockOut, note } = session;
    const sessions = [];

    let currentStart = new Date(clockIn);
    let currentEnd = new Date(clockOut);

    if (currentEnd <= currentStart) {
        // Clock out is before clock in; invalid session
        console.warn('Clock Out before Clock In detected.');
        return [];
    }

    // While current session crosses midnight
    while (currentStart.toLocaleDateString() !== currentEnd.toLocaleDateString()) {
        // End of the current day at 23:59:59
        const endOfDay = new Date(currentStart);
        endOfDay.setHours(23, 59, 59, 999);

        // Create session up to midnight
        sessions.push({ clockIn: currentStart, clockOut: endOfDay, note });

        // Start of the next day at 00:00:00
        currentStart = new Date(currentStart);
        currentStart.setDate(currentStart.getDate() + 1);
        currentStart.setHours(0, 0, 0, 0);
    }

    // Add the last session
    sessions.push({ clockIn: currentStart, clockOut: currentEnd, note });

    return sessions;
}

// Update Day Lines
function updateDayLines(timelines, notesPerDay) {
    // Reset ongoing session globals
    currentTimeBlock = null;
    currentSessionStart = null;
    
    dayLineContainer.innerHTML = '<div class="hour-timeline"></div>'; // Reset hour timeline
    createHourTimeline();

    Object.keys(timelines).sort().forEach(day => {
        let lastClockIn = null;

        timelines[day].forEach(session => {
            const { clockIn, clockOut, note } = session;

            if (clockIn && clockOut !== null) {
                addDayLine(day, clockIn, clockOut, note, false);
            } else if (clockIn && clockOut === null) {
                // Ongoing session
                lastClockIn = session;
                addDayLine(day, clockIn, new Date(), note, true);
            }
        });
    });
}

// Update Totals Tables
function updateTotalsTables(data) {
    const { minutesWorked, earnings, notesPerDay } = data;  // Add notesPerDay to destructuring
    
    // Daily Totals (simplify rows)
    const dailyTotalsTableBody = document.querySelector('#daily-totals-table tbody');
    dailyTotalsTableBody.innerHTML = '';

    Object.keys(minutesWorked).sort().forEach(day => {
        const rawMinutes = minutesWorked[day];
        const minutes = Math.round(rawMinutes);
        const hours = Math.floor(minutes / 60);
        const remainingMinutes = Math.round(minutes % 60);
        const earningsForDay = earnings[day].toFixed(2);

        const row = document.createElement('tr');
        row.id = `daily-${day}`;
        row.innerHTML = `
            <td class="date-cell">${day}</td>
            <td class="hours-cell">${hours}h ${remainingMinutes}m</td>
            <td class="earnings-cell">$${earningsForDay}</td>
        `;
        dailyTotalsTableBody.appendChild(row);
        baseDailyTotals[day] = { minutes: rawMinutes, earnings: earnings[day] };
    });

    // Weekly Totals (simplify rows)
    const weeklyTotalsTableBody = document.querySelector('#weekly-totals-table tbody');
    weeklyTotalsTableBody.innerHTML = '';

    const weeks = {};
    for (const day in minutesWorked) {
        const date = new Date(day);
        const weekNumber = getWeekNumber(date);
        if (!weeks[weekNumber]) {
            weeks[weekNumber] = { minutes: 0, earnings: 0 };  // Remove notes from weekly object
        }
        weeks[weekNumber].minutes += minutesWorked[day];
        weeks[weekNumber].earnings += earnings[day];
    }

    const sortedWeeks = Object.keys(weeks).sort((a, b) => a - b);

    sortedWeeks.forEach(week => {
        const rawMinutes = weeks[week].minutes;
        const minutes = Math.round(rawMinutes);
        const hours = Math.floor(minutes / 60);
        const remainingMinutes = Math.round(minutes % 60);
        const earningsForWeek = weeks[week].earnings.toFixed(2);

        const row = document.createElement('tr');
        row.id = `weekly-${week}`;
        row.innerHTML = `
            <td class="date-cell">Week ${week}</td>
            <td class="hours-cell">${hours}h ${remainingMinutes}m</td>
            <td class="earnings-cell">$${earningsForWeek}</td>
        `;
        weeklyTotalsTableBody.appendChild(row);
        baseWeeklyTotals[week] = { minutes: weeks[week].minutes, earnings: weeks[week].earnings };
    });

    // Overall Totals (update formatting)
    const totalMinutes = Object.values(minutesWorked).reduce((a, b) => a + b, 0);
    const totalEarnings = Object.values(earnings).reduce((a, b) => a + b, 0);
    const totalHours = Math.floor(totalMinutes / 60);
    const totalRemainingMinutes = Math.round(totalMinutes % 60);

    baseOverallMinutes = totalMinutes;
    baseOverallEarnings = totalEarnings;

    document.getElementById('overall-hours').textContent = `${totalHours}h ${totalRemainingMinutes}m`;
    document.getElementById('overall-earnings').textContent = `$${totalEarnings.toFixed(2)}`;

    // Update invoice total amount for print
    document.getElementById('invoice-total-amount').textContent = 
        `$${totalEarnings.toFixed(2)}`;

    // Populate Activities Table with all data
    populateActivitiesTable(data.timelines, notesPerDay);  // Pass notesPerDay to activities table
}

// New function to populate activities table
function createSectionHeader(title) {
    const header = document.createElement('tr');
    const cell = document.createElement('td');
    cell.colSpan = 5;
    cell.className = 'section-header';
    cell.textContent = title;
    header.appendChild(cell);
    return header;
}

function createDivider() {
    const row = document.createElement('tr');
    const cell = document.createElement('td');
    cell.colSpan = 5;
    cell.className = 'section-divider';
    row.appendChild(cell);
    return row;
}

// Update function signature to accept notesPerDay
function populateActivitiesTable(timelines, notesPerDay) {
    const activitiesTableBody = document.querySelector('#activities-table tbody');
    activitiesTableBody.innerHTML = '';
    
    // Group sessions by date
    const sessionsByDate = {};
    Object.entries(timelines).forEach(([date, sessions]) => {
        sessionsByDate[date] = sessions;
    });

    // Create table rows - sort by date ascending (oldest first)
    Object.entries(sessionsByDate)
        .sort(([dateA], [dateB]) => dateA.localeCompare(dateB))
        .forEach(([date, sessions]) => {
            const uniqueNotes = new Set(sessions.map(session => session.note).filter(note => note));
            const notes = Array.from(uniqueNotes).join('; ') || 'N/A';
            const row = document.createElement('tr');
            row.innerHTML = `
                <td class="date-cell">${date}</td>
                <td class="notes-cell">${notes}</td>
            `;
            activitiesTableBody.appendChild(row);
        });
}

// Get ISO Week Number
function getWeekNumber(date) {
    const tempDate = new Date(date.getTime());
    tempDate.setHours(0, 0, 0, 0);
    tempDate.setDate(tempDate.getDate() + 4 - (tempDate.getDay() || 7));
    const yearStart = new Date(tempDate.getFullYear(), 0, 1);
    const weekNo = Math.ceil((((tempDate - yearStart) / 86400000) + 1) / 7);
    return weekNo;
}

// Update Totals
function updateTotals(data) {
    updateTotalsTables(data);
}

// Clock In Function
async function clockIn() {
    let note = document.getElementById('note').value.trim();
    if (!note) {
        note = 'null';
    }
    try {
        const response = await fetch('/clock_in', {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({ note })
        });
        const data = await response.json();
        if (data.status === "Error") {
            showMessage(data.message, true);
        } else {
            const localTime = new Date(data.time); // Interpreted as local time
            showMessage(`Clocked in at ${formatTimeForDisplay(localTime)} with note: "${note}"`, false);
            init(); // Refresh data
        }
    } catch (error) {
        showMessage('Clock In failed.', true);
        console.error('Clock In failed:', error);
    }
}

// Clock Out Function
async function clockOut() {
    const note = 'null'; // Always set note to 'null' for clock out
    try {
        const response = await fetch('/clock_out', {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({ note })
        });
        const data = await response.json();
        if (data.status === "Error") {
            showMessage(data.message, true);
        } else {
            const localTime = new Date(data.time); // Interpreted as local time
            showMessage(`Clocked out at ${formatTimeForDisplay(localTime)}`, false);
            init(); // Refresh data
        }
    } catch (error) {
        showMessage('Clock Out failed.', true);
        console.error('Clock Out failed:', error);
    }
}

// Format Time for Display
function formatTimeForDisplay(date) {
    if (!date) return '';
    const options = {
        hour: 'numeric',
        minute: 'numeric',
        hour12: true
    };
    return date.toLocaleTimeString([], options);
}

// Set Status based on Data
function setStatus(status, lastTime) {
    const statusElement = document.getElementById('status');

    if (status === "Clocked in") {
        const date = new Date(lastTime); // Interpreted as local time
        statusElement.textContent = `Clocked in at ${formatTimeForDisplay(date)}`;
        statusElement.className = 'clocked-in';
    } else if (status === "Clocked out" && lastTime) {
        const date = new Date(lastTime); // Interpreted as local time
        statusElement.textContent = `Clocked out at ${formatTimeForDisplay(date)}`;
        statusElement.className = 'clocked-out';
    } else {
        statusElement.textContent = `Clocked out`;
        statusElement.className = 'clocked-out';
    }
}

// Initialize Application
async function init() {
    initializeContainers();
    setupInvoiceDates();
    const rawData = await fetchData();
    const processedData = processData(rawData);

    const currentClockInSession = findCurrentClockInSession(processedData.timelines);
    if (currentClockInSession) {
        setStatus("Clocked in", currentClockInSession.clockIn);
    } else {
        // Find the last clock-out time
        const lastTime = rawData.filter(entry => entry.Action === 'Clock Out').pop()?.Time;
        setStatus("Clocked out", lastTime);
    }

    updateDayLines(processedData.timelines, processedData.notesPerDay);
    updateTotals(processedData);
    createHourTimeline();

    setupInfoForms();

    // Apply saved wallpaper if exists
    const wallpaperUrl = localStorage.getItem('wallpaperUrl');
    if (wallpaperUrl) {
        document.body.style.backgroundImage = `url('${wallpaperUrl}')`;
    }

    syncNoteInputs();

    if (!localStorage.getItem('payRate')) {
        localStorage.setItem('payRate', '21.00');
    }
}

// Handle Window Resize for Hour Timeline Alignment
window.addEventListener('resize', createHourTimeline);

// Initialize Application on Page Load
document.addEventListener('DOMContentLoaded', init);

// Update ongoing session width in real time
setInterval(() => {
    if (currentTimeBlock && currentSessionStart) {
        const now = new Date();
        const startDate = new Date(currentSessionStart);
        const startPercent = ((startDate.getHours() + startDate.getMinutes()/60 + startDate.getSeconds()/3600) / 24) * 100;
        const nowPercent = ((now.getHours() + now.getMinutes()/60 + now.getSeconds()/3600) / 24) * 100;
        currentTimeBlock.style.width = `${nowPercent - startPercent}%`;
        currentTimeBlock.title = `Note: ${currentTimeBlock.dataset.note || 'N/A'}\nStart: ${formatTimeForDisplay(startDate)}\nEnd: Ongoing`;
    }
}, 1000);

// New: Update overall totals (money and time) in real time if clocked in
setInterval(() => {
    if (currentSessionStart) {
        const now = new Date();
        const liveMinutes = (now - new Date(currentSessionStart)) / 60000; // elapsed in minutes
        const updatedTotalMinutes = baseOverallMinutes + liveMinutes;
        const updatedTotalHours = Math.floor(updatedTotalMinutes / 60);
        const updatedRemainingMinutes = Math.round(updatedTotalMinutes % 60);

        // Get current payRate
        const payRate = parseFloat(localStorage.getItem('payRate')) || 21.0;
        const liveEarnings = (liveMinutes / 60) * payRate;
        const updatedTotalEarnings = baseOverallEarnings + liveEarnings;

        document.getElementById('overall-hours').textContent = `${updatedTotalHours}h ${updatedRemainingMinutes}m`;
        document.getElementById('overall-earnings').textContent = `$${updatedTotalEarnings.toFixed(2)}`;

        // Determine current session's day and week
        const sessionDate = new Date(currentSessionStart);
        const dayKey = sessionDate.toLocaleDateString('en-CA'); // YYYY-MM-DD
        const weekKey = getWeekNumber(sessionDate);

        // Update Daily Totals if row exists
        let dailyRow = document.getElementById(`daily-${dayKey}`);
        if (dailyRow) {
            const baseDaily = baseDailyTotals[dayKey] || { minutes: 0, earnings: 0 };
            const updatedDailyMinutes = baseDaily.minutes + liveMinutes;
            const updatedDailyHours = Math.floor(updatedDailyMinutes / 60);
            const updatedDailyRemaining = Math.round(updatedDailyMinutes % 60);
            const updatedDailyEarnings = baseDaily.earnings + liveEarnings;
            // Assuming cells: 0-date, 1-hours, 2-earnings, 3-notes
            dailyRow.cells[1].textContent = `${updatedDailyHours}h ${updatedDailyRemaining}m`;
            dailyRow.cells[2].textContent = `$${updatedDailyEarnings.toFixed(2)}`;
        }
        // Update Weekly Totals if row exists
        let weeklyRow = document.getElementById(`weekly-${weekKey}`);
        if (weeklyRow) {
            const baseWeekly = baseWeeklyTotals[weekKey] || { minutes: 0, earnings: 0 };
            const updatedWeeklyMinutes = baseWeekly.minutes + liveMinutes;
            const updatedWeeklyHours = Math.floor(updatedWeeklyMinutes / 60);
            const updatedWeeklyRemaining = Math.round(updatedWeeklyMinutes % 60);
            const updatedWeeklyEarnings = baseWeekly.earnings + liveEarnings;
            // Assuming cells: 0-week, 1-hours, 2-earnings, 3-notes
            weeklyRow.cells[1].textContent = `${updatedWeeklyHours}h ${updatedWeeklyRemaining}m`;
            weeklyRow.cells[2].textContent = `$${updatedWeeklyEarnings.toFixed(2)}`;
        }
    }
}, 1000);

// Update Sender and Recipient Info
function setupInfoForms() {
    const senderInputs = document.querySelectorAll('.info-form input[id^="sender-"]');
    const recipientInputs = document.querySelectorAll('.info-form input[id^="recipient-"]');
    const senderInfoDisplay = document.getElementById('sender-info-display');
    const recipientInfoDisplay = document.getElementById('recipient-info-display');

    senderInputs.forEach(input => {
        input.addEventListener('input', updateSenderInfo);
    });

    recipientInputs.forEach(input => {
        input.addEventListener('input', updateRecipientInfo);
    });

    // Initial call to populate info displays
    updateSenderInfo();
    updateRecipientInfo();
}

// Update Sender and Recipient Info to load from localStorage
function updateSenderInfo() {
    const sender = JSON.parse(localStorage.getItem('senderInfo') || '{}');
    const senderInfoDisplay = document.getElementById('sender-info-display');
    senderInfoDisplay.innerHTML = `
        ${sender.name ? `<strong>${sender.name}</strong><br>` : ''}
        ${sender.address1 ? `${sender.address1}<br>` : ''}
        ${sender.address2 ? `${sender.address2}<br>` : ''}
        ${sender.phone ? `Phone: ${sender.phone}<br>` : ''}
        ${sender.email ? `Email: ${sender.email}<br>` : ''}
    `;
}

function updateRecipientInfo() {
    const recipient = JSON.parse(localStorage.getItem('recipientInfo') || '{}');
    const recipientInfoDisplay = document.getElementById('recipient-info-display');
    recipientInfoDisplay.innerHTML = `
        ${recipient.name ? `<strong>${recipient.name}</strong><br>` : ''}
        ${recipient.address1 ? `${recipient.address1}<br>` : ''}
        ${recipient.address2 ? `${recipient.address2}<br>` : ''}
        ${recipient.phone ? `Phone: ${recipient.phone}<br>` : ''}
        ${recipient.email ? `Email: ${recipient.email}<br>` : ''}
    `;
}

// Functions to open/close settings modal and save settings
function openSettings() {
    const modal = document.getElementById('settings-modal');
    loadSettings(); // Populate form fields from localStorage
    modal.style.display = 'block';

    // Add event listener for Escape key
    document.addEventListener('keydown', handleEscapeKey);
}

function closeSettings() {
    const modal = document.getElementById('settings-modal');
    modal.style.display = 'none';

    // Remove event listener for Escape key
    document.removeEventListener('keydown', handleEscapeKey);
}

function handleEscapeKey(event) {
    if (event.key === 'Escape') {
        closeSettings();
    }
}

function loadSettings() {
    // Load pay rate
    const payRate = localStorage.getItem('payRate') || '21.00';
    document.getElementById('settings-pay-rate').value = payRate;
    
    // Load wallpaper
    const wallpaperUrl = localStorage.getItem('wallpaperUrl') || '';
    document.getElementById('wallpaper-url').value = wallpaperUrl;
    if (wallpaperUrl) {
        document.body.style.backgroundImage = `url('${wallpaperUrl}')`;
    }
    
    // Load theme
    const savedTheme = localStorage.getItem('selectedTheme') || 'default';
    document.getElementById('theme-select').value = savedTheme;
    changeTheme();
    
    // Load existing settings
    const sender = JSON.parse(localStorage.getItem('senderInfo') || '{}');
    document.getElementById('sender-name').value = sender.name || '';
    document.getElementById('sender-address1').value = sender.address1 || '';
    document.getElementById('sender-address2').value = sender.address2 || '';
    document.getElementById('sender-phone').value = sender.phone || '';
    document.getElementById('sender-email').value = sender.email || '';
    
    const recipient = JSON.parse(localStorage.getItem('recipientInfo') || '{}');
    document.getElementById('recipient-name').value = recipient.name || '';
    document.getElementById('recipient-address1').value = recipient.address1 || '';
    document.getElementById('recipient-address2').value = recipient.address2 || '';
    document.getElementById('recipient-phone').value = recipient.phone || '';
    document.getElementById('recipient-email').value = recipient.email || '';
}

function saveSettings() {
    // Save pay rate
    const payRate = document.getElementById('settings-pay-rate').value.trim();
    localStorage.setItem('payRate', payRate || '21.00');
    
    // Save wallpaper
    const wallpaperUrl = document.getElementById('wallpaper-url').value.trim();
    localStorage.setItem('wallpaperUrl', wallpaperUrl);
    if (wallpaperUrl) {
        document.body.style.backgroundImage = `url('${wallpaperUrl}')`;
    }
    
    // Save theme
    const theme = document.getElementById('theme-select').value;
    localStorage.setItem('selectedTheme', theme);
    changeTheme();
    
    // Save existing settings
    const senderInfo = {
        name: document.getElementById('sender-name').value.trim(),
        address1: document.getElementById('sender-address1').value.trim(),
        address2: document.getElementById('sender-address2').value.trim(),
        phone: document.getElementById('sender-phone').value.trim(),
        email: document.getElementById('sender-email').value.trim()
    };
    localStorage.setItem('senderInfo', JSON.stringify(senderInfo));
    
    const recipientInfo = {
        name: document.getElementById('recipient-name').value.trim(),
        address1: document.getElementById('recipient-address1').value.trim(),
        address2: document.getElementById('recipient-address2').value.trim(),
        phone: document.getElementById('recipient-phone').value.trim(),
        email: document.getElementById('recipient-email').value.trim()
    };
    localStorage.setItem('recipientInfo', JSON.stringify(recipientInfo));
    
    updateSenderInfo();  // Refresh displayed info
    updateRecipientInfo();
    closeSettings();
}

// Add date formatting for invoice
function setupInvoiceDates() {
    const now = new Date();
    // Removed due date calculation
    const dateOptions = { year: 'numeric', month: 'long', day: 'numeric' };
    document.getElementById('invoice-date').textContent = now.toLocaleDateString('en-US', dateOptions);

    // Update the invoice date whenever printing
    window.addEventListener('beforeprint', () => {
        const printDate = new Date();
        document.getElementById('invoice-date').textContent = 
            printDate.toLocaleDateString('en-US', dateOptions);
    });
}

// Sync note inputs between mobile and desktop
function syncNoteInputs() {
    const noteDesktop = document.getElementById('note');
    const noteMobile = document.getElementById('note-mobile');
    const statusDesktop = document.getElementById('status');
    const statusMobile = document.getElementById('status-mobile');

    noteDesktop.addEventListener('input', () => {
        noteMobile.value = noteDesktop.value;
    });

    noteMobile.addEventListener('input', () => {
        noteDesktop.value = noteMobile.value;
    });

    // Update both status displays
    function updateBothStatuses(text, className) {
        statusDesktop.textContent = text;
        statusMobile.textContent = text;
        statusDesktop.className = className;
        statusMobile.className = className;
    }

    // Modify existing setStatus function
    const originalSetStatus = setStatus;
    setStatus = function(status, lastTime) {
        originalSetStatus(status, lastTime);
        if (status === "Clocked in") {
            const date = new Date(lastTime);
            updateBothStatuses(
                `Clocked in at ${formatTimeForDisplay(date)}`,
                'clocked-in'
            );
        } else if (status === "Clocked out" && lastTime) {
            const date = new Date(lastTime);
            updateBothStatuses(
                `Clocked out at ${formatTimeForDisplay(date)}`,
                'clocked-out'
            );
        } else {
            updateBothStatuses('Clocked out', 'clocked-out');
        }
    };
}

// Function to change theme
function changeTheme() {
    const theme = document.getElementById('theme-select').value;
    const themeStylesheet = document.getElementById('theme-stylesheet');
    themeStylesheet.href = `./static/themes/${theme}.css`;
    localStorage.setItem('selectedTheme', theme);
}

// Load the saved theme on page load
document.addEventListener('DOMContentLoaded', () => {
    const savedTheme = localStorage.getItem('selectedTheme') || 'default';
    document.getElementById('theme-select').value = savedTheme;
    changeTheme();
});