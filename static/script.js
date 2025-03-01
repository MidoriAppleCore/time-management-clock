let chartContainer;
let dayLineContainer;
let currentTimeBlock = null;

// Initialize containers
function initializeContainers() {
    dayLineContainer = document.querySelector('.day-line-container');
}

// Create Hour Timeline
function createHourTimeline() {
    const hourTimeline = document.querySelector('.hour-timeline');
    hourTimeline.innerHTML = '';
    for (let i = 0; i <= 24; i++) {
        const marker = document.createElement('div');
        marker.className = 'hour-marker';
        marker.style.left = `${(i / 24) * 100}%`;
        marker.textContent = i < 24 ? formatHour(i) : '';
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

    const payRate = parseFloat(document.getElementById('pay-rate').value) || 21.0;

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
                if (session.note) {
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
            if (session.note) {
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
    const { minutesWorked, earnings, notesPerDay } = data;

    // Daily Totals
    const dailyTotalsTableBody = document.querySelector('#daily-totals-table tbody');
    dailyTotalsTableBody.innerHTML = ''; // Clear existing rows

    const sortedDays = Object.keys(minutesWorked).sort();

    for (const day of sortedDays) {
        const minutes = Math.round(minutesWorked[day]);
        const hours = Math.floor(minutes / 60);
        const remainingMinutes = Math.round(minutes % 60);
        const earningsForDay = earnings[day].toFixed(2);
        const notes = notesPerDay[day].length > 0 ? notesPerDay[day].join(', ') : 'N/A';

        const row = document.createElement('tr');

        const dateCell = document.createElement('td');
        dateCell.textContent = day;

        const hoursCell = document.createElement('td');
        hoursCell.textContent = `${hours}h ${remainingMinutes}m`;

        const earningsCell = document.createElement('td');
        earningsCell.textContent = `$${earningsForDay}`;

        const notesCell = document.createElement('td');
        notesCell.textContent = notes;

        row.appendChild(dateCell);
        row.appendChild(hoursCell);
        row.appendChild(earningsCell);
        row.appendChild(notesCell);

        dailyTotalsTableBody.appendChild(row);
    }

    // Weekly Totals
    const weeklyTotalsTableBody = document.querySelector('#weekly-totals-table tbody');
    weeklyTotalsTableBody.innerHTML = ''; // Clear existing rows

    const weeks = {};
    for (const day in minutesWorked) {
        const date = new Date(day);
        const weekNumber = getWeekNumber(date);
        if (!weeks[weekNumber]) {
            weeks[weekNumber] = { minutes: 0, earnings: 0, notes: new Set() };
        }
        weeks[weekNumber].minutes += minutesWorked[day];
        weeks[weekNumber].earnings += earnings[day];
        if (notesPerDay[day].length > 0) {
            notesPerDay[day].forEach(note => weeks[weekNumber].notes.add(note));
        }
    }

    const sortedWeeks = Object.keys(weeks).sort((a, b) => a - b);

    for (const week of sortedWeeks) {
        const minutes = Math.round(weeks[week].minutes);
        const hours = Math.floor(minutes / 60);
        const remainingMinutes = Math.round(minutes % 60);
        const earningsForWeek = weeks[week].earnings.toFixed(2);
        const notes = weeks[week].notes.size > 0 ? Array.from(weeks[week].notes).join(', ') : 'N/A';

        const row = document.createElement('tr');

        const weekCell = document.createElement('td');
        weekCell.textContent = `Week ${week}`;

        const hoursCell = document.createElement('td');
        hoursCell.textContent = `${hours}h ${remainingMinutes}m`;

        const earningsCell = document.createElement('td');
        earningsCell.textContent = `$${earningsForWeek}`;

        const notesCell = document.createElement('td');
        notesCell.textContent = notes;

        row.appendChild(weekCell);
        row.appendChild(hoursCell);
        row.appendChild(earningsCell);
        row.appendChild(notesCell);

        weeklyTotalsTableBody.appendChild(row);
    }

    // Overall Totals
    const totalMinutes = Object.values(minutesWorked).reduce((a, b) => a + b, 0);
    const totalEarnings = Object.values(earnings).reduce((a, b) => a + b, 0).toFixed(2);
    const totalHours = Math.floor(totalMinutes / 60);
    const totalRemainingMinutes = Math.round(totalMinutes % 60);

    const allNotesSet = new Set();
    for (const day in notesPerDay) {
        notesPerDay[day].forEach(note => allNotesSet.add(note));
    }
    const allNotes = allNotesSet.size > 0 ? Array.from(allNotesSet).join(', ') : 'N/A';

    document.getElementById('overall-hours').textContent = `${totalHours}h ${totalRemainingMinutes}m`;
    document.getElementById('overall-earnings').textContent = `$${totalEarnings}`;
    document.getElementById('overall-notes').textContent = allNotes;
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
    const note = document.getElementById('note').value.trim();
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
    const note = document.getElementById('note').value.trim();
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
            showMessage(`Clocked out at ${formatTimeForDisplay(localTime)} with note: "${note}"`, false);
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
}

// Handle Window Resize for Hour Timeline Alignment
window.addEventListener('resize', createHourTimeline);

// Initialize Application on Page Load
document.addEventListener('DOMContentLoaded', init);

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

    function updateSenderInfo() {
        const name = document.getElementById('sender-name').value;
        const address1 = document.getElementById('sender-address1').value;
        const address2 = document.getElementById('sender-address2').value;
        const phone = document.getElementById('sender-phone').value;
        const email = document.getElementById('sender-email').value;

        senderInfoDisplay.innerHTML = `
            ${name ? `<strong>${name}</strong><br>` : ''}
            ${address1 ? `${address1}<br>` : ''}
            ${address2 ? `${address2}<br>` : ''}
            ${phone ? `Phone: ${phone}<br>` : ''}
            ${email ? `Email: ${email}<br>` : ''}
        `;
    }

    function updateRecipientInfo() {
        const name = document.getElementById('recipient-name').value;
        const address1 = document.getElementById('recipient-address1').value;
        const address2 = document.getElementById('recipient-address2').value;
        const phone = document.getElementById('recipient-phone').value;
        const email = document.getElementById('recipient-email').value;

        recipientInfoDisplay.innerHTML = `
            ${name ? `<strong>${name}</strong><br>` : ''}
            ${address1 ? `${address1}<br>` : ''}
            ${address2 ? `${address2}<br>` : ''}
            ${phone ? `Phone: ${phone}<br>` : ''}
            ${email ? `Email: ${email}<br>` : ''}
        `;
    }
}