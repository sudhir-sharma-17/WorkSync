import sqlite3
import pandas as pd
import json

conn = sqlite3.connect('attendance.db')

batch = pd.read_sql('SELECT * FROM upload_batches ORDER BY created_at DESC LIMIT 1', conn)
if batch.empty:
    print('No batches found.')
else:
    batch_id = batch.iloc[0]['id']
    debug_meta_str = batch.iloc[0]['debug_meta']
    print(f'Latest Batch ID: {batch_id}')
    
    if debug_meta_str:
        debug_meta = json.loads(debug_meta_str)
        print(json.dumps(debug_meta, indent=2))
        
        # We need "Workers Present In Excel But Missing In Preview"
        # The parser unique_workers are the ones from Excel.
        # The Preview unique workers are those in attendance_records for this batch.
        excel_workers = set(debug_meta.get('parser', {}).get('unique_workers', []))
        
        records = pd.read_sql(f'SELECT * FROM attendance_records WHERE batch_id="{batch_id}"', conn)
        
        worker_ids = records['worker_id'].unique()
        # Get worker names from DB
        if len(worker_ids) > 0:
            ids_str = ",".join([f"'{x}'" for x in worker_ids])
            workers = pd.read_sql(f'SELECT id, name FROM workers WHERE id IN ({ids_str})', conn)
            preview_workers = set(workers['name'].tolist())
        else:
            preview_workers = set()
            
        print("\nWorkers Present In Excel But Missing In Preview:")
        missing_in_preview = excel_workers - preview_workers
        for w in missing_in_preview: print(f" - {w}")
        if not missing_in_preview: print(" None")
        
        print("\nWorkers Present In Preview But Not In Excel:")
        missing_in_excel = preview_workers - excel_workers
        for w in missing_in_excel: print(f" - {w}")
        if not missing_in_excel: print(" None")
        
    else:
        print('No debug_meta found for this batch.')
