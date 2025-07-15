
function loadAnyChart() {
    return new Promise((resolve, reject) => {
        if (typeof anychart !== 'undefined') {
            resolve();
            return;
        }

        const script = document.createElement('script');
        script.src = 'https://cdn.anychart.com/releases/8.11.0/js/anychart-core.min.js';
        script.onload = () => {
            const script2 = document.createElement('script');
            script2.src = 'https://cdn.anychart.com/releases/8.11.0/js/anychart-stock.min.js';
            script2.onload = resolve;
            script2.onerror = reject;
            document.head.appendChild(script2);
        };
        script.onerror = reject;
        document.head.appendChild(script);
    });
}

document.addEventListener('DOMContentLoaded', async function () {
    const token = document.cookie.split('; ').find(row => row.startsWith('token='));
    // Removed redirect logic.

    try {
        await loadAnyChart();
        fetchWeatherFromSheet();
        updateCurrentDateTime();
        loadLatestImage();
        setInterval(updateCurrentDateTime, 1000);
        setInterval(loadLatestImage, 300000); // Refresh image every 5 mins
        setInterval(() => {
            // Removed redirect logic.
        }, 300000); // Check token every 5 mins
    } catch (error) {
        console.error('Failed to load charts:', error);
        document.getElementById('chart-error').style.display = 'block';
    }
});

// Globals
let timeLabels = [], temperatureData = [], humidityData = [], airQualityData = [], coLevelData = [], allRows = [], recentRows = [], charts = {};

async function fetchWeatherFromSheet() {
    const sheetId = "1WszA4FCruzCup5MrkyDr3R9tSsm0Sw04XHXNGgdZ6EA";
    const apiKey = "AIzaSyB3WJqBb5nfafSR1qQfWsm1sEDZJf40E74";
    const range = "Sheet1!A:F";
    const url = `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values/${range}?key=${apiKey}`;

    try {
        const response = await fetch(url);
        if (!response.ok) {
            // Google Sheets API returns errors with a non-2xx status code,
            // but fetch doesn't throw an error. We handle this manually.
            const errorData = await response.json().catch(() => ({ message: response.statusText }));
            throw new Error(`Google Sheets API Error: ${errorData?.error?.message || response.statusText}`);
        }
        const data = await response.json();

        if (data.values && data.values.length > 1) {
            allRows = data.values.slice(1);

            recentRows = allRows.slice(-20);

            if (recentRows.length > 0) {
                temperatureData = recentRows.map(row => parseFloat(row[2]) || null);
                humidityData = recentRows.map(row => parseFloat(row[3]) || null);
                airQualityData = recentRows.map(row => parseFloat(row[4]) || null);
                coLevelData = recentRows.map(row => parseFloat(row[5]) || null);

                const latestRow = recentRows.at(-1);
                document.querySelector("#current-temperature").innerHTML = `${latestRow[2]}°C`;
                document.querySelector("#humidity").innerHTML = `${latestRow[3]}%`;
                updateAirQuality(latestRow[4]);
                updateCOLevel(latestRow[5]);

                updateGraphs();
            } else {
                console.warn("Data fetched successfully, but no entries were found in the last 10 days.");
                // You could display a message to the user here.
            }
        } else {
            console.warn("No data returned from Google Sheets. The sheet might be empty or only contain a header row.");
        }
    } catch (error) {
        console.error("Error fetching weather data:", error);
        const errorEl = document.getElementById('chart-error');
        if (errorEl) {
            errorEl.textContent = 'Failed to load data from Google Sheets. Check the browser console for details.';
            errorEl.style.display = 'block';
        }
    }
}

function renderAnyChart(containerId, title, values, customLabels = []) {
    if (!anychart) {
        console.error('AnyChart not loaded');
        return;
    }

    if (charts[containerId]) charts[containerId].dispose();

    // Ensure we have valid data
    if (!values || values.length === 0) {
        console.error('No data to render chart');
        return;
    }

    try {
        const dataSet = (customLabels.length > 0)
            ? customLabels.map((label, i) => {
                // Parse date string in YYYY-MM-DD format
                const [year, month, day] = label.split('-').map(Number);
                const date = new Date(year, month - 1, day, 12, 0, 0); // Always use noon time
                return [date, values[i]];
            }).filter(([date, value]) => value !== null) // Keep null dates but filter null values
            : recentRows.map((row, i) => {
                const [y, m, d] = row[0].split('-').map(Number);
                let [h = 0, min = 0, s = 0] = row[1]?.includes(":") ? row[1].split(':').map(Number) : [0, 0, 0];
                return [new Date(y, m - 1, d, h, min, s), values[i]];
            }).filter(([date, value]) => !isNaN(date.getTime()) && value !== null);

        const table = anychart.data.table();
        table.addData(dataSet);

        const chart = anychart.stock();
        chart.background().fill("#f5d7b7");

        const plot = chart.plot(0);
        plot.xAxis().labels().format(function () {
            const date = new Date(this.value);
            return anychart.format.dateTime(date, customLabels.length > 0 ? "dd MMM" : "HH:mm");
        });

        const latestTime = dataSet.at(-1)?.[0];
        const formattedTime = latestTime?.toLocaleTimeString('en-IN', { 
            hour: '2-digit', 
            minute: '2-digit', 
            hour12: false 
        }) || "--:--";

        chart.title(`${title} ${formattedTime}`);
        plot.yGrid(true).xGrid(true);

        const lineSeries = plot.line(table).name(title).stroke('#2FA85A', 3);
        lineSeries.risingStroke('#2FA85A', 3);
        lineSeries.fallingStroke('#EE4237', 3);
        lineSeries.connectMissingPoints(true);
        lineSeries.tooltip().format("{%value}");

        chart.scroller().line(table);
        plot.legend().enabled(Boolean(title?.trim()));
        chart.container(containerId);
        chart.draw();

        charts[containerId] = chart;
    } catch (error) {
        console.error('Error rendering chart:', error);
    }
}

function clearAllCharts() {
    Object.values(charts).forEach(chart => chart.dispose());
    charts = {};
}

function getDailyAverages() {
    const dailyMap = {};
    const allDates = new Set();
    const now = new Date();
    const tenDaysAgo = new Date();
    tenDaysAgo.setDate(now.getDate() - 10);

    // Generate all dates in the 10-day range
    for (let d = new Date(tenDaysAgo); d <= now; d.setDate(d.getDate() + 1)) {
        const dateStr = d.toISOString().split('T')[0];
        allDates.add(dateStr);
        if (!dailyMap[dateStr]) dailyMap[dateStr] = { temp: [], humidity: [], air: [], co: [] };
    }

    // Process data rows
    recentRows.forEach(row => {
        const date = row[0];
        if (!dailyMap[date]) dailyMap[date] = { temp: [], humidity: [], air: [], co: [] };

        // Only push valid numbers (skip null/undefined/NaN)
        if (!isNaN(parseFloat(row[2]))) dailyMap[date].temp.push(parseFloat(row[2]));
        if (!isNaN(parseFloat(row[3]))) dailyMap[date].humidity.push(parseFloat(row[3]));
        if (!isNaN(parseFloat(row[4]))) dailyMap[date].air.push(parseFloat(row[4]));
        if (!isNaN(parseFloat(row[5]))) dailyMap[date].co.push(parseFloat(row[5]));
    });

    const labels = [], temp = [], humidity = [], air = [], co = [];
    // Process dates in chronological order
    Array.from(allDates).sort().forEach(date => {
        labels.push(date);
        const day = dailyMap[date] || { temp: [], humidity: [], air: [], co: [] };
        temp.push(day.temp.length ? avg(day.temp) : null);
        humidity.push(day.humidity.length ? avg(day.humidity) : null);
        air.push(day.air.length ? avg(day.air) : null);
        co.push(day.co.length ? avg(day.co) : null);
    });

    return { labels, temp, humidity, airQuality: air, co };
}

function avg(arr) {
    const filtered = arr.filter(val => val !== null && !isNaN(val));
    return filtered.length ? (filtered.reduce((a, b) => a + b, 0) / filtered.length).toFixed(2) : null;
}

function updateGraphs(mode = 'hourly') {
    if (mode === 'hourly') {
        const latest500 = recentRows.slice(-500);
        recentRows = latest500;
        const safeParse = (val) => {
            const num = parseFloat(val);
            return isNaN(num) ? null : num;
          };
          
        temperatureData = latest500.map(row => safeParse(row[2]));
        humidityData    = latest500.map(row => safeParse(row[3]));
        airQualityData  = latest500.map(row => safeParse(row[4]));
        coLevelData     = latest500.map(row => safeParse(row[5]));

        renderAnyChart("tempChart", "Temperature (°C) - Latest at", temperatureData);
        renderAnyChart("humidityChart", "Humidity (%) - Latest at", humidityData);
        renderAnyChart("airQualityChart", "Air Quality (%) - Latest at", airQualityData);
        renderAnyChart("coChart", "CO Level - Latest at", coLevelData);
    } else {
        const daily = getDailyAverages();
        renderAnyChart("tempChart", "Avg Temperature (°C) - Latest average observed at", daily.temp, daily.labels);
        renderAnyChart("humidityChart", "Avg Humidity (%) - Latest average observed at", daily.humidity, daily.labels);
        renderAnyChart("airQualityChart", "Avg Air Quality (%) - Latest average observed at", daily.airQuality, daily.labels);
        renderAnyChart("coChart", "Avg CO Level (%) - Latest average observed at", daily.co, daily.labels);
    }
}

function updateCurrentDateTime() {
    const now = new Date();
    document.getElementById("current-date").textContent = now.toLocaleDateString('en-IN', { year: 'numeric', month: 'short', day: 'numeric' });
    document.getElementById("current-time").textContent = now.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true });
    const timeToday = document.getElementById("time-today");
    if (timeToday) timeToday.textContent = now.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true });
    const currentDay = document.getElementById("current-day");
    if (currentDay) currentDay.textContent = now.toLocaleDateString('en-IN', { weekday: 'long' });
}

function updateAirQuality(value) {
    const el = document.getElementById('air-quality');
    const text = document.getElementById('air-quality-text');
    el.textContent = value;

    if (value <= 30) {
        text.textContent = 'Good (less than 280ppm CO₂)';
        text.className = 'quality-text aq-good';
    } else if (value <= 50) {
        text.textContent = 'Moderate (up to 350ppm CO₂)';
        text.className = 'quality-text aq-moderate';
    } else if (value <= 70) {
        text.textContent = 'Unhealthy (350-500ppm)';
        text.className = 'quality-text aq-unhealthy';
    } else {
        text.textContent = 'Hazardous (above 500ppm)';
        text.className = 'quality-text aq-hazardous';
    }
}

function updateCOLevel(level) {
    const el = document.getElementById('co-level');
    const text = document.getElementById('co-level-text');
    el.textContent = level;

    if (level <= 50) {
        text.textContent = 'Good (25-30ppm)';
        text.className = 'quality-text co-good';
    } else {
        text.textContent = 'Hazardous (above 30ppm)';
        text.className = 'quality-text co-high';
    }
}

function loadLatestImage() {
    const img = document.getElementById('drive-image');
    if (img) {
        img.src = '/api/latest-image?' + new Date().getTime();
        img.onerror = () => { img.src = 'image.png'; };
    }
}

// Logout
document.querySelector('.dropdown-content a[href="/logout"]')?.addEventListener('click', function (e) {
    e.preventDefault();
    document.cookie = 'token=; Path=/; Expires=Thu, 01 Jan 1970 00:00:01 GMT;';
    window.location.href = '/';
});

// Toggle buttons
document.getElementById("toggle-hourly")?.addEventListener("click", () => {
    updateGraphs("hourly");
    toggleButtons("hourly");
});
document.getElementById("toggle-daily")?.addEventListener("click", () => {
    updateGraphs("daily");
    toggleButtons("daily");
});
function toggleButtons(active) {
    const hourly = document.getElementById("toggle-hourly");
    const daily = document.getElementById("toggle-daily");

    if (active === "hourly") {
        hourly.classList.add("btn-success");
        hourly.classList.remove("btn-outline-secondary");
        daily.classList.remove("btn-success");
        daily.classList.add("btn-outline-secondary");
    } else {
        daily.classList.add("btn-success");
        daily.classList.remove("btn-outline-secondary");
        hourly.classList.remove("btn-success");
        hourly.classList.add("btn-outline-secondary");
    }
}
