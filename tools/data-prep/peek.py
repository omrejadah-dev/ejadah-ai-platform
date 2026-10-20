import sys, openpyxl
f = sys.argv[1]; n = int(sys.argv[2]) if len(sys.argv) > 2 else 8
wb = openpyxl.load_workbook(f, read_only=True, data_only=True)
for ws in wb.worksheets:
    ws.reset_dimensions()
    print(f"sheet={ws.title!r}")
    for i, row in enumerate(ws.iter_rows(values_only=True)):
        print(i, row)
        if i >= n: break
