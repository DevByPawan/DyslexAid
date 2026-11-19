from flask import Flask, request, jsonify
from flask_cors import CORS
import joblib
import os
import math
import logging

app = Flask(__name__)
CORS(app)

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("dyslexaid-ml")

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
MODEL_PATH = os.path.join(BASE_DIR, "dyslexaid_model.pkl")

try:
    model = joblib.load(MODEL_PATH)
    logger.info("DyslexAid ML model loaded successfully from %s", MODEL_PATH)
except Exception as e:
    logger.error("Failed to load model from %s: %s", MODEL_PATH, e)
    model = None

risk_labels = {
    0: "Low Risk",
    1: "Moderate Risk",
    2: "High Risk"
}

@app.route("/")
def home():
    return jsonify({
        "message": "DyslexAid Backend is Running 🚀"
    })

@app.route("/health")
def health():
    return jsonify({
        "status": "operational" if model is not None else "degraded",
        "liveness": "ok",
        "modelReady": model is not None,
        "model": "dyslexaid_model.pkl"
    })

@app.route("/predict", methods=["POST"])
def predict():
    # 1. Require valid JSON payload
    data = request.get_json(silent=True)
    if data is None or not isinstance(data, dict):
        return jsonify({
            "error": "Invalid payload: Request body must be a valid JSON object."
        }), 400

    # 2. Check model readiness
    if model is None:
        logger.error("Inference requested but model is not loaded.")
        return jsonify({
            "error": "ML Screening model is currently unavailable."
        }), 503

    # 3. Validate required fields
    required_fields = ["voiceAccuracy", "letterScore", "wordScore"]
    for field in required_fields:
        if field not in data or data[field] is None:
            return jsonify({
                "error": f"Missing required field: '{field}'."
            }), 400

    # 4. Validate types (numeric, rejecting booleans, strings, arrays)
    for field in required_fields:
        val = data[field]
        if isinstance(val, bool) or not isinstance(val, (int, float)):
            return jsonify({
                "error": f"Invalid type for '{field}': expected numeric value."
            }), 400
        if math.isnan(val) or math.isinf(val):
            return jsonify({
                "error": f"Invalid value for '{field}': NaN and Infinity are not allowed."
            }), 400

    voice_accuracy = float(data["voiceAccuracy"])
    letter_score = float(data["letterScore"])
    word_score = float(data["wordScore"])

    # 5. Validate sensible score ranges
    if not (0 <= voice_accuracy <= 100):
        return jsonify({
            "error": "Invalid range for 'voiceAccuracy': must be between 0 and 100."
        }), 400

    if not (0 <= letter_score <= 7):
        return jsonify({
            "error": "Invalid range for 'letterScore': must be between 0 and 7."
        }), 400

    if not (0 <= word_score <= 7):
        return jsonify({
            "error": "Invalid range for 'wordScore': must be between 0 and 7."
        }), 400

    # 6. Execute prediction safely without leaking stack traces
    try:
        prediction = model.predict([
            [
                voice_accuracy,
                letter_score,
                word_score
            ]
        ])

        risk = risk_labels.get(int(prediction[0]), "Moderate Risk")
        return jsonify({
            "risk": risk
        })
    except Exception as err:
        logger.error("Internal prediction error: %s", err)
        return jsonify({
            "error": "An internal error occurred while generating prediction."
        }), 500

if __name__ == "__main__":
    port = int(os.environ.get("PORT", 5000))
    app.run(host="0.0.0.0", port=port)