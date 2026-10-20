import sys, glob, os
import pandas as pd
pd.set_option("display.width", 250); pd.set_option("display.max_columns", 60); pd.set_option("display.max_colwidth", 40)
d = sys.argv[1]
for f in sorted(glob.glob(os.path.join(d, "*.xlsx"))):
    print("="*100); print(os.path.basename(f))
    try:
        xl = pd.ExcelFile(f)
        for sh in xl.sheet_names:
            df = xl.parse(sh, header=None)
            print(f"  sheet={sh!r} shape={df.shape}")
            print(df.head(6).to_string())
    except Exception as e:
        print("  ERROR", e)
