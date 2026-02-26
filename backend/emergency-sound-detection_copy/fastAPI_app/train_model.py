"""
Train the emergency sound detection model and save artifacts.
Run this script once before starting the Flask app.
"""

import numpy as np
import pandas as pd
import pickle
from sklearn.model_selection import train_test_split
from sklearn.preprocessing import StandardScaler
from sklearn.ensemble import RandomForestClassifier

# ── Load dataset ──────────────────────────────────────────────
dataset = pd.read_csv("../extracted_features.csv")

# ── Feature selection (correlation ≥ 0.45 with label) ────────
corr = dataset.corr()
features = np.abs(corr["label"]).sort_values(ascending=False)[
    np.abs(corr["label"]).sort_values(ascending=False) >= 0.45
].index

# Drop unhelpful features
avoid_features = ["label", "mfcc2", "mfcc4"]
features = features[~features.isin(avoid_features)]

# ── Prepare X and y ──────────────────────────────────────────
X = dataset[features].values
y = dataset["label"].values

X_train, X_test, y_train, y_test = train_test_split(
    X, y, test_size=0.2, stratify=y, random_state=42, shuffle=True
)

# ── Feature scaling ──────────────────────────────────────────
sc = StandardScaler()
X_train = sc.fit_transform(X_train)
X_test = sc.transform(X_test)

# ── Train Random Forest (best performer) ─────────────────────
rf = RandomForestClassifier(n_estimators=10, criterion="entropy", random_state=42)
rf.fit(X_train, y_train)

accuracy = rf.score(X_test, y_test)
print(f"Random Forest accuracy: {accuracy:.4f}")

# ── Save artifacts ────────────────────────────────────────────
with open("model.pkl", "wb") as f:
    pickle.dump(rf, f)

with open("scaler.pkl", "wb") as f:
    pickle.dump(sc, f)

with open("features.pkl", "wb") as f:
    pickle.dump(list(features), f)

print("Saved: model.pkl, scaler.pkl, features.pkl")
