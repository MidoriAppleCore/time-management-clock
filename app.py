
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
        try:
            df = pd.read_csv(file)
            
            # Treat 'Time' as local time
            df['Time'] = pd.to_datetime(df['Time'])  # Treat it as local time (without timezone conversion)
            
            # Check if 'Note' column exists, and if not, create it with empty strings
            if 'Note' not in df.columns:
                df['Note'] = ''
            
            # Replace NaN and NaT with None (null in JSON), and 'null' strings with empty strings
            df = df.replace({pd.NA: None, pd.NaT: None, 'null': ''})
            
            # Convert to JSON format (keep in local time for now)
            for _, row in df.iterrows():
                # Skip rows with invalid time data
                if pd.isna(row['Time']) or row['Time'] is None:
                    continue
                    
                try:
                    time_str = row['Time'].strftime('%Y-%m-%d %H:%M:%S')
                    data.append({
                        "Action": row['Action'],
                        "Time": time_str,  # Keep local time format
                        "Note": row.get('Note', '') or ''  # Default to empty string if Note is missing, NaN, or 'null'
                    })
                except (ValueError, AttributeError) as e:
                    print(f"Skipping row with invalid time data: {row}, error: {e}")
                    continue
        except Exception as e:
            print(f"Error reading file {file}: {e}")
            continue
    
    # Sort all data by Time to ensure chronological order
    try:
        data_sorted = sorted(data, key=lambda x: datetime.strptime(x['Time'], '%Y-%m-%d %H:%M:%S'))
        return data_sorted
    except ValueError as e:
        print(f"Error sorting data by time: {e}")
        return data

def get_current_status():
    data = load_data()
    
    if not data:
        return "Clocked out", None
    
    last_action_entry = data[-1]
    last_action = last_action_entry['Action']
    last_time = last_action_entry['Time']
    
    # Validate the time string
    try:
        # Try to parse the time to ensure it's valid
        datetime.strptime(last_time, '%Y-%m-%d %H:%M:%S')
    except (ValueError, TypeError):
        # If time is invalid, return without time
        return ("Clocked in", None) if last_action == "Clock In" else ("Clocked out", None)
    
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
    
    note = request.form.get('note', '').strip()
    # Don't use 'null' string, use empty string for empty notes
    if not note:
        note = ''
    
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
    
    note = request.form.get('note', '').strip()
    # Don't use 'null' string, use empty string for empty notes
    if not note:
        note = ''
    
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
    app.run(host='0.0.0.0', port=5000)

