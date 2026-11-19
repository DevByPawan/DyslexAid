#!/usr/bin/env python3
"""
DyslexAid - Phase 5.3.1 Flask ML Backend & Hardened Input Validation Tests
Tests the real Flask ML service using python test client against all edge cases:
 - Valid predictions across all risk classes (Low, Moderate, High)
 - Missing JSON body
 - Missing required keys
 - Invalid types (string, boolean, list, object, None)
 - NaN and Infinity values
 - Out-of-range scores (<0, >100 for voiceAccuracy, <0, >7 for letterScore & wordScore)
 - Non-leakage of internal stack traces
 - Dedicated /health endpoint verification
"""
import sys
import os

sys.path.insert(0, os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "backend"))

try:
    from app import app
except Exception as e:
    print(f"FAILED to import app: {e}")
    sys.exit(1)

app.config["TESTING"] = True
app.config["DEBUG"] = False
client = app.test_client()

passed = 0
failed = 0

def test(name, condition):
    global passed, failed
    if condition:
        print(f"  ✓ PASSED: {name}")
        passed += 1
    else:
        print(f"  ✗ FAILED: {name}")
        failed += 1

print("=======================================================================")
print("  Running Phase 5.3.1 Hardened Flask ML Input Validation & Inference Tests")
print("=======================================================================\n")

# 1. Test Root & Dedicated Health Liveness
res_root = client.get("/")
data_root = res_root.get_json()
test("GET / responds with HTTP 200", res_root.status_code == 200)
test("GET / returns expected welcome message", data_root.get("message") == "DyslexAid Backend is Running 🚀")

res_health = client.get("/health")
data_health = res_health.get_json()
test("GET /health responds with HTTP 200", res_health.status_code == 200)
test("GET /health reports status operational", data_health.get("status") == "operational")
test("GET /health reports modelReady true", data_health.get("modelReady") is True)
test("GET /health identifies model file", data_health.get("model") == "dyslexaid_model.pkl")

# 2. Test Valid Predictions (Low, Moderate, High Risk)
res_low = client.post("/predict", json={"voiceAccuracy": 95, "letterScore": 7, "wordScore": 7})
test("Valid High-Performance input returns HTTP 200", res_low.status_code == 200)
test("High-Performance input yields Low Risk", res_low.get_json().get("risk") == "Low Risk")

res_high = client.post("/predict", json={"voiceAccuracy": 25, "letterScore": 1, "wordScore": 0})
test("Valid Low-Performance input returns HTTP 200", res_high.status_code == 200)
test("Low-Performance input yields High Risk", res_high.get_json().get("risk") == "High Risk")

res_mod = client.post("/predict", json={"voiceAccuracy": 65, "letterScore": 4, "wordScore": 4})
test("Valid Intermediate input returns HTTP 200", res_mod.status_code == 200)
test("Intermediate input yields Moderate Risk", res_mod.get_json().get("risk") == "Moderate Risk")

# 3. Test Missing JSON Body & Non-JSON Content
res_no_body = client.post("/predict")
test("Missing request body returns HTTP 400", res_no_body.status_code == 400)
test("Missing body returns structured error message", "Invalid payload" in res_no_body.get_json().get("error", ""))

res_text = client.post("/predict", data="plain text data", content_type="text/plain")
test("Non-JSON content returns HTTP 400", res_text.status_code == 400)

res_array = client.post("/predict", json=[1, 2, 3])
test("JSON Array payload returns HTTP 400", res_array.status_code == 400)

# 4. Test Missing Required Fields
res_missing_voice = client.post("/predict", json={"letterScore": 5, "wordScore": 5})
test("Missing voiceAccuracy returns HTTP 400", res_missing_voice.status_code == 400)
test("Error identifies missing voiceAccuracy field", "voiceAccuracy" in res_missing_voice.get_json().get("error", ""))

res_missing_letter = client.post("/predict", json={"voiceAccuracy": 80, "wordScore": 5})
test("Missing letterScore returns HTTP 400", res_missing_letter.status_code == 400)

res_missing_word = client.post("/predict", json={"voiceAccuracy": 80, "letterScore": 5})
test("Missing wordScore returns HTTP 400", res_missing_word.status_code == 400)

# 5. Test Type Validation (Reject strings, booleans, null, lists)
res_str = client.post("/predict", json={"voiceAccuracy": "ninety", "letterScore": 5, "wordScore": 5})
test("String value for voiceAccuracy returns HTTP 400", res_str.status_code == 400)

res_bool = client.post("/predict", json={"voiceAccuracy": True, "letterScore": 5, "wordScore": 5})
test("Boolean value for voiceAccuracy returns HTTP 400", res_bool.status_code == 400)

res_null = client.post("/predict", json={"voiceAccuracy": None, "letterScore": 5, "wordScore": 5})
test("Null value for voiceAccuracy returns HTTP 400", res_null.status_code == 400)

res_list = client.post("/predict", json={"voiceAccuracy": [80], "letterScore": 5, "wordScore": 5})
test("List value for voiceAccuracy returns HTTP 400", res_list.status_code == 400)

# 6. Test NaN and Infinity
res_nan = client.post("/predict", json={"voiceAccuracy": float("nan"), "letterScore": 5, "wordScore": 5})
test("NaN value returns HTTP 400", res_nan.status_code == 400)

res_inf = client.post("/predict", json={"voiceAccuracy": float("inf"), "letterScore": 5, "wordScore": 5})
test("Infinity value returns HTTP 400", res_inf.status_code == 400)

# 7. Test Out-of-Range Values
res_neg_voice = client.post("/predict", json={"voiceAccuracy": -5, "letterScore": 5, "wordScore": 5})
test("Negative voiceAccuracy returns HTTP 400", res_neg_voice.status_code == 400)

res_high_voice = client.post("/predict", json={"voiceAccuracy": 105, "letterScore": 5, "wordScore": 5})
test("voiceAccuracy > 100 returns HTTP 400", res_high_voice.status_code == 400)

res_neg_letter = client.post("/predict", json={"voiceAccuracy": 80, "letterScore": -1, "wordScore": 5})
test("Negative letterScore returns HTTP 400", res_neg_letter.status_code == 400)

res_high_letter = client.post("/predict", json={"voiceAccuracy": 80, "letterScore": 8, "wordScore": 5})
test("letterScore > 7 returns HTTP 400", res_high_letter.status_code == 400)

res_neg_word = client.post("/predict", json={"voiceAccuracy": 80, "letterScore": 5, "wordScore": -1})
test("Negative wordScore returns HTTP 400", res_neg_word.status_code == 400)

res_high_word = client.post("/predict", json={"voiceAccuracy": 80, "letterScore": 5, "wordScore": 15})
test("wordScore > 7 returns HTTP 400", res_high_word.status_code == 400)

# 8. Non-Leakage of Internal Stack Traces
for r in [res_no_body, res_str, res_nan, res_high_voice, res_high_letter]:
    body_str = r.get_data(as_text=True)
    test("Error response does not expose Traceback", "Traceback (most recent call last)" not in body_str)
    test("Error response does not leak internal file paths", "app.py" not in body_str and "/Users/" not in body_str)

print("\n=======================================================================")
print(f"  Hardened Flask ML Tests Completed: {passed} passed, {failed} failed")
print("=======================================================================\n")

if failed > 0:
    sys.exit(1)
