import sqlite3
import pandas as pd

conn = sqlite3.connect('attendance.db')

batch_id = '254fcec0-9548-4a03-aae8-bc702d0eadce'
df = pd.read_sql(f'SELECT * FROM attendance_records WHERE batch_id="{batch_id}"', conn)

worker_names = pd.read_sql('SELECT id, name FROM workers', conn)
worker_map = dict(zip(worker_names['id'], worker_names['name']))
df['worker_name'] = df['worker_id'].map(worker_map)

# Find duplicates on (worker_id, attendance_date)
counts = df.groupby(['worker_name', 'attendance_date', 'project_name']).size().reset_index(name='count')
duplicates = counts[counts['count'] > 1]

print('Duplicated generated records (from P.5 or PP):')
for _, row in duplicates.iterrows():
    print(f"Worker: {row['worker_name']}, Date: {row['attendance_date']}, Project: {row['project_name']}, Copies: {row['count']}")
    
    # Let's see the durations to figure out if it was P.5 or PP
    dupes = df[(df['worker_name'] == row['worker_name']) & (df['attendance_date'] == row['attendance_date'])]
    durations = dupes['duration'].tolist()
    if '4-6 Hours' in durations:
        source_code = 'P.5'
    else:
        source_code = 'PP'
        
    print(f"  -> Source Code: {source_code}")
    print(f"  -> Durations generated: {durations}")
