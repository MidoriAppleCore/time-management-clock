const { app, BrowserWindow } = require('electron');
const { spawn } = require('child_process');
const http = require('http');

let flaskProcess; // Reference to the Flask process

function createWindow() {
    const win = new BrowserWindow({
        width: 1000,
        height: 600,
        webPreferences: {
            nodeIntegration: true
        },
        autoHideMenuBar: true
    });

    win.setMenuBarVisibility(false);

    // Start the Flask app using spawn
    flaskProcess = spawn('python3', ['./app.py']);

    flaskProcess.stdout.on('data', (data) => {
        console.log(`Flask app stdout: ${data}`);
    });

    flaskProcess.stderr.on('data', (data) => {
        console.error(`Flask app stderr: ${data}`);
    });

    flaskProcess.on('close', (code) => {
        console.log(`Flask app exited with code ${code}`);
    });

    const checkServer = () => {
        http.get('http://127.0.0.1:5000', (res) => {
            console.log('Flask server is up, loading Electron window...');
            win.loadURL('http://127.0.0.1:5000');
        }).on('error', () => {
            console.log('Waiting for the Flask server to start...');
            setTimeout(checkServer, 1000); // Check again after 1 second
        });
    };

    checkServer(); // Start checking if the server is up

    // When the Electron window is closed, kill the Flask process
    win.on('closed', () => {
        if (flaskProcess) {
            flaskProcess.kill('SIGTERM'); // Gracefully terminate the Flask process
        }
    });
}

app.whenReady().then(createWindow);

// Quit the Flask process when all windows are closed
app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        app.quit();
    }
});

app.on('quit', () => {
    if (flaskProcess) {
        flaskProcess.kill('SIGTERM'); // Gracefully terminate the Flask process on app quit
    }
});

app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
        createWindow();
    }
});
