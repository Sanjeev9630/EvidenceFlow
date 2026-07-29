# Sample data

Synthetic industrial ESG evidence for EvidenceFlow demos.

| Path | Purpose |
|---|---|
| `csv/electricity-berlin-q1.csv` | Clean multi-site electricity activity data |
| `csv/electricity-bad-rows.csv` | Validation torture file (missing, negative, duplicate, outlier) |
| `csv/diesel-fleet-feb.csv` | Fuel activity data |
| `csv/travel-expenses.csv` | Business travel activity data |
| `csv/materials-q1.csv` | Steel and aluminium purchasing data |
| `xlsx/travel-expenses.xlsx` | Excel import path with travel activity data |
| `pdf/*.txt` | Invoice/receipt stand-ins for Day 5 document extraction (paste or LLM) |
| `factors/emission-factors.seed.json` | Illustrative emission factor library (NOT licensed ecoinvent/DEFRA) |

All factors use `MOCK-*` source labels on purpose.

The factor library deliberately contains variants that exercise matching: the same activity in
several regions (`DE` / `IT` / `EU` / `GLOBAL`), the same factor on different unit bases
(`kWh` and `MWh`, `kg` and `tonne`), and two vintages of the DE grid factor (2023 and 2024) so
vintage selection can be demonstrated by changing a row's date.
