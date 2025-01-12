const { app, BrowserWindow, Tray, Menu, ipcMain } = require("electron");
const path = require("path");
const bonjour = require("bonjour")();
const axios = require("axios").default;

let store;
let tray = null;
let mainWindow = null;
let keylightService = null;
let updateInterval = null;
let forceQuit = false;

// Default transition points throughout the day
const DEFAULT_TRANSITIONS = {
  sunrise: {
    time: "07:00",
    temperature: 6500,
    brightness: 90,
    startTime: "07:00",
  },
  day: {
    time: "12:00",
    temperature: 5900,
    brightness: 100,
    startTime: "12:00",
  },
  sunset: {
    time: "17:00",
    temperature: 4500,
    brightness: 80,
    startTime: "17:00",
  },
  evening: {
    time: "20:00",
    temperature: 3500,
    brightness: 60,
    startTime: "20:00",
  },
  night: {
    time: "23:00",
    temperature: 2900,
    brightness: 40,
    startTime: "23:00",
  },
};

async function initializeStore() {
  try {
    const { default: Store } = await import("electron-store");
    store = new Store();

    if (!store.get("transitions")) {
      store.set("transitions", DEFAULT_TRANSITIONS);
    }
  } catch (error) {
    console.error("Failed to initialize store:", error);
  }
}

function timeToMinutes(timeStr) {
  const [hours, minutes] = timeStr.split(":").map(Number);
  return hours * 60 + minutes;
}

function getCurrentMinutes() {
  const now = new Date();
  return now.getHours() * 60 + now.getMinutes();
}

function interpolateValue(value1, value2, factor) {
  return Math.round(value1 + (value2 - value1) * factor);
}

function getCurrentSettings() {
  const transitions = store.get("transitions");
  const currentMinutes = getCurrentMinutes();

  const points = Object.entries(transitions)
    .map(([key, value]) => ({
      name: key,
      minutes: timeToMinutes(value.time),
      temperature: value.temperature,
      brightness: value.brightness,
    }))
    .sort((a, b) => a.minutes - b.minutes);

  let before = points[points.length - 1];
  let after = points[0];

  for (let i = 0; i < points.length; i++) {
    if (points[i].minutes > currentMinutes) {
      after = points[i];
      before = points[i === 0 ? points.length - 1 : i - 1];
      break;
    }
  }

  let minutesBetween = after.minutes - before.minutes;
  if (minutesBetween < 0) minutesBetween += 24 * 60;

  let progressMinutes = currentMinutes - before.minutes;
  if (progressMinutes < 0) progressMinutes += 24 * 60;

  const factor = progressMinutes / minutesBetween;

  return {
    temperature: interpolateValue(
      before.temperature,
      after.temperature,
      factor
    ),
    brightness: interpolateValue(before.brightness, after.brightness, factor),
  };
}

async function updateKeyLight() {
  if (!keylightService) return;

  try {
    const settings = getCurrentSettings();
    console.log("Updating light with settings:", settings);

    const url = `http://${keylightService.ip}:${keylightService.port}/elgato/lights`;
    await axios.put(url, {
      lights: [
        {
          on: 1,
          brightness: settings.brightness,
          temperature: settings.temperature,
        },
      ],
    });
  } catch (error) {
    console.error("Error updating light:", error);
  }
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 500,
    height: 700,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, "preload.js"),
    },
    show: true,
    frame: true,
    resizable: false,
    maximizable: false,
    minimizable: true,
  });

  mainWindow.setMenuBarVisibility(false);

  const iconPath = path.join(__dirname, "icon.ico");
  try {
    mainWindow.setIcon(iconPath);
  } catch (error) {
    console.error("Failed to set icon:", error);
  }

  mainWindow.setTitle("KeyLux: Key Light Scheduler");

  mainWindow.loadFile(path.join(__dirname, "index.html")).catch((err) => {
    console.error("Failed to load index.html:", err);
  });

  // Handle close button click
  mainWindow.on("close", (event) => {
    if (!forceQuit) {
      event.preventDefault();
      mainWindow.hide();
    }
  });

  if (process.env.NODE_ENV === "development") {
    mainWindow.webContents.openDevTools();
  }
}

function createTray() {
  const iconPath = path.join(__dirname, "icon.ico");

  try {
    tray = new Tray(iconPath);

    const contextMenu = Menu.buildFromTemplate([
      {
        label: "Show Settings",
        click: () => {
          mainWindow.show();
        },
      },
      { type: "separator" },
      {
        label: "Update Now",
        click: () => updateKeyLight(),
      },
      { type: "separator" },
      {
        label: "Exit KeyLux",
        click: () => {
          forceQuit = true;
          app.quit();
        },
      },
    ]);

    tray.setToolTip("KeyLux");
    tray.setContextMenu(contextMenu);
    tray.on("click", () => {
      mainWindow.isVisible() ? mainWindow.hide() : mainWindow.show();
    });
  } catch (error) {
    console.error("Failed to create tray:", error);
  }
}

async function startup() {
  try {
    await initializeStore();
    createWindow();
    createTray();

    const browser = bonjour.find({ type: "elg" });
    browser.on("up", (service) => {
      keylightService = {
        ip: service["referer"].address,
        port: service.port,
      };

      console.log("Found Elgato Key Light");

      updateKeyLight();

      if (updateInterval) {
        clearInterval(updateInterval);
      }

      updateInterval = setInterval(updateKeyLight, 60 * 1000);
    });
  } catch (error) {
    console.error("Startup failed:", error);
  }
}

// App event handlers
app.whenReady().then(startup);

app.on("before-quit", () => {
  forceQuit = true;
});

app.on("activate", () => {
  mainWindow.show();
});

app.on("window-all-closed", (event) => {
  if (process.platform !== "darwin") {
    if (!forceQuit) {
      event.preventDefault();
    }
  }
});

// IPC handlers
ipcMain.handle("reset-defaults", async () => {
  try {
    store.set("transitions", DEFAULT_TRANSITIONS);
    await updateKeyLight();
    return DEFAULT_TRANSITIONS;
  } catch (error) {
    console.error("Reset defaults failed:", error);
    throw error;
  }
});

ipcMain.handle("get-transitions", () => {
  try {
    return store.get("transitions");
  } catch (error) {
    console.error("Get transitions failed:", error);
    throw error;
  }
});

ipcMain.handle("save-transitions", async (event, transitions) => {
  try {
    store.set("transitions", transitions);
    await updateKeyLight();
    return true;
  } catch (error) {
    console.error("Save transitions failed:", error);
    throw error;
  }
});
