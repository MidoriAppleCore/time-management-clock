
from flask import Flask, render_template, request, jsonify
import pandas as pd
from datetime import datetime
import os

app = Flask(__name__)

LOG_DIR = 'time_logs'

# Ensure the directory exists
if not os.path.exists(LOG_DIR):
    os.makedirs(LOG_DIR)

def get_filename_for_date(date):
    return os.path.join(LOG_DIR, f'time_tracking_{date.strftime("%Y-%m-%d")}.csv')

# Load data from CSV and treat the 'Time' column as local time
def load_data():
    all_files = sorted([os.path.join(LOG_DIR, f) for f in os.listdir(LOG_DIR) if f.endswith('.csv')])
    data = []
    
    for file in all_files:
        df = pd.read_csv(file)
        
        # Treat 'Time' as local time
        df['Time'] = pd.to_datetime(df['Time'])  # Treat it as local time (without timezone conversion)
        
        # Check if 'Note' column exists, and if not, create it with empty strings
        if 'Note' not in df.columns:
            df['Note'] = ''
        
        # Replace NaN and NaT with None (null in JSON)
        df = df.replace({pd.NA: None, pd.NaT: None})
        
        # Convert to JSON format (keep in local time for now)
        for _, row in df.iterrows():
            data.append({
                "Action": row['Action'],
                "Time": row['Time'].strftime('%Y-%m-%d %H:%M:%S'),  # Keep local time format
                "Note": row.get('Note', '')  # Default to empty string if Note is missing or NaN
            })
    
    # Sort all data by Time to ensure chronological order
    data_sorted = sorted(data, key=lambda x: datetime.strptime(x['Time'], '%Y-%m-%d %H:%M:%S'))
    return data_sorted

def get_current_status():
    data = load_data()
    
    if not data:
        return "Clocked out", None
    
    last_action_entry = data[-1]
    last_action = last_action_entry['Action']
    last_time = last_action_entry['Time']
    
    return ("Clocked in", last_time) if last_action == "Clock In" else ("Clocked out", last_time)

@app.route('/')
def index():
    current_status, last_time = get_current_status()
    return render_template('index.html', status=current_status, last_time=last_time)

# Save the clock-in time as local time
@app.route('/clock_in', methods=['POST'])
def clock_in():
    current_status, _ = get_current_status()
    if current_status == "Clocked in":
        return jsonify({"status": "Error", "message": "Already clocked in!"}), 400
    
    note = request.form.get('note', '')
    current_time = datetime.now()  # Use local time (not UTC)
    filename = get_filename_for_date(current_time)
    data = {'Action': 'Clock In', 'Time': current_time.strftime('%Y-%m-%d %H:%M:%S'), 'Note': note}
    df = pd.DataFrame([data])
    df.to_csv(filename, mode='a', header=not os.path.exists(filename), index=False)
    return jsonify({"status": "Clocked in", "time": data['Time']})

# Save the clock-out time as local time
@app.route('/clock_out', methods=['POST'])
def clock_out():
    current_status, _ = get_current_status()
    if current_status == "Clocked out":
        return jsonify({"status": "Error", "message": "Already clocked out!"}), 400
    
    note = request.form.get('note', '')
    current_time = datetime.now()  # Use local time (not UTC)
    filename = get_filename_for_date(current_time)
    data = {'Action': 'Clock Out', 'Time': current_time.strftime('%Y-%m-%d %H:%M:%S'), 'Note': note}
    df = pd.DataFrame([data])
    df.to_csv(filename, mode='a', header=not os.path.exists(filename), index=False)
    return jsonify({"status": "Clocked out", "time": data['Time']})

@app.route('/data', methods=['GET'])
def data():
    data = load_data()
    return jsonify(data)

if __name__ == '__main__':
    app.run(debug=True)
