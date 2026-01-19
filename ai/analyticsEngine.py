import pandas as pd
import numpy as np
from datetime import datetime
import json
import sys
from typing import Dict, List
from collections import defaultdict
import warnings

warnings.filterwarnings("ignore")


class AnalyticsEngine:
    def __init__(self):
        self.metrics_cache = {}

    def _group_matches_by_type(self, matches: List[Dict]) -> Dict[str, List[Dict]]:
        grouped = defaultdict(list)
        for m in matches:
            grouped[m.get("match_type", "unknown")].append(m)
        grouped["total"] = matches
        return grouped

    def calculate_performance_metrics(self, reconciliation_data: Dict) -> Dict:
        try:
            # ✅ Handle matches as list or dict
            raw_matches = reconciliation_data.get("matches", [])
            if isinstance(raw_matches, list):
                matches = self._group_matches_by_type(raw_matches)
            else:
                matches = raw_matches

            # ✅ Read from summary (new format) or fallback
            summary = reconciliation_data.get("summary", {})
            total_bank = summary.get("totalBank", reconciliation_data.get("total_bank_transactions", 0))
            total_book = summary.get("totalBook", reconciliation_data.get("total_book_transactions", 0))
            processing_time = reconciliation_data.get("processing_time", 0)

            exact_matches = len(matches.get("exact", []))
            fuzzy_matches = len(matches.get("fuzzy", []))
            ml_matches = len(matches.get("ml_suggested", []))
            total_matches = len(matches.get("total", []))

            match_rate = (
                (total_matches * 2) / (total_bank + total_book) * 100 if (total_bank + total_book) else 0
            )
            exact_rate = exact_matches / total_matches * 100 if total_matches else 0
            fuzzy_rate = fuzzy_matches / total_matches * 100 if total_matches else 0
            ml_rate = ml_matches / total_matches * 100 if total_matches else 0

            transactions_per_second = (
                (total_bank + total_book) / processing_time if processing_time > 0 else 0
            )

            confidence_scores = [m.get("confidence_score", 0) for m in matches.get("total", [])]
            avg_confidence = np.mean(confidence_scores) if confidence_scores else 0
            confidence_std = np.std(confidence_scores) if confidence_scores else 0

            manual_review_count = len(
                [m for m in matches.get("total", []) if m.get("manual_review_required")]
            )
            risk_rate = manual_review_count / total_matches * 100 if total_matches else 0

            return {
                "basic_metrics": {
                    "total_bank_transactions": total_bank,
                    "total_book_transactions": total_book,
                    "total_matches": total_matches,
                    "exact_matches": exact_matches,
                    "fuzzy_matches": fuzzy_matches,
                    "ml_matches": ml_matches,
                    "unmatched_count": (total_bank + total_book) - (total_matches * 2),
                },
                "performance_rates": {
                    "match_rate": round(match_rate, 2),
                    "exact_rate": round(exact_rate, 2),
                    "fuzzy_rate": round(fuzzy_rate, 2),
                    "ml_rate": round(ml_rate, 2),
                    "risk_rate": round(risk_rate, 2),
                },
                "efficiency_metrics": {
                    "processing_time_seconds": round(processing_time, 3),
                    "transactions_per_second": round(transactions_per_second, 2),
                    "average_confidence": round(avg_confidence, 3),
                    "confidence_std": round(confidence_std, 3),
                },
                "quality_indicators": {
                    "high_confidence_matches": len([s for s in confidence_scores if s >= 0.9]),
                    "medium_confidence_matches": len([s for s in confidence_scores if 0.7 <= s < 0.9]),
                    "low_confidence_matches": len([s for s in confidence_scores if s < 0.7]),
                    "manual_review_required": manual_review_count,
                },
                "summary": {
                    "overall_match_rate": f"{round(match_rate, 2)}%",
                    "avg_confidence": round(avg_confidence, 3),
                    "transactions_analyzed": total_bank + total_book,
                },
            }
        except Exception as e:
            return {"error": f"Analytics calculation failed: {str(e)}"}

    def analyze_transaction_patterns(self, transactions: List[Dict]) -> Dict:
        try:
            if not transactions:
                return {"error": "No transactions provided"}

            df = pd.DataFrame(transactions)
            if "date" not in df or "amount" not in df:
                return {"error": "Invalid transaction schema"}

            df["date"] = pd.to_datetime(df["date"], errors="coerce")
            df = df.dropna(subset=["date"])
            if df.empty:
                return {"error": "No valid dates in transactions"}

            df["amount"] = pd.to_numeric(df["amount"], errors="coerce").fillna(0)
            df["amount_abs"] = df["amount"].abs()
            df["weekday"] = df["date"].dt.day_name()
            df["hour"] = df["date"].dt.hour
            df["month"] = df["date"].dt.month

            amount_stats = {
                "mean": float(df["amount_abs"].mean()),
                "median": float(df["amount_abs"].median()),
                "std": float(df["amount_abs"].std()),
                "min": float(df["amount_abs"].min()),
                "max": float(df["amount_abs"].max()),
            }

            daily_counts = df.groupby(df["date"].dt.date).size()
            weekday_pattern = df["weekday"].value_counts().to_dict()
            hourly_pattern = df["hour"].value_counts().to_dict()

            return {
                "amount_analysis": amount_stats,
                "frequency_patterns": {
                    "daily_average": float(daily_counts.mean()),
                    "daily_std": float(daily_counts.std()),
                    "busiest_weekday": max(weekday_pattern, key=weekday_pattern.get),
                    "weekday_distribution": weekday_pattern,
                    "hourly_distribution": hourly_pattern,
                },
                "outliers": self._detect_amount_outliers(df["amount_abs"].tolist()),
            }
        except Exception as e:
            return {"error": f"Pattern analysis failed: {str(e)}"}

    def _detect_amount_outliers(self, amounts: List[float]) -> Dict:
        if not amounts:
            return {}
        arr = np.array(amounts)
        q1, q3 = np.percentile(arr, [25, 75])
        iqr = q3 - q1
        lower, upper = q1 - 1.5 * iqr, q3 + 1.5 * iqr
        outliers = arr[(arr < lower) | (arr > upper)]
        return {
            "count": len(outliers),
            "percentage": round(len(outliers) / len(arr) * 100, 2),
            "bounds": {"lower": float(lower), "upper": float(upper)},
        }

    def generate_matching_insights(self, matches: List[Dict]) -> Dict:
        try:
            if not matches:
                return {"error": "No matches provided"}
            confidences = [m.get("confidence_score", 0) for m in matches]
            match_types = [m.get("match_type", "unknown") for m in matches]
            return {
                "avg_confidence": round(np.mean(confidences), 3) if confidences else 0,
                "match_type_distribution": dict(pd.Series(match_types).value_counts()),
            }
        except Exception as e:
            return {"error": f"Insights failed: {str(e)}"}

    def generate_recommendations(self, analytics_data: Dict) -> List[str]:
        recs = []
        try:
            perf = analytics_data.get("performance_rates", {})
            if perf.get("match_rate", 0) < 80:
                recs.append("Low match rate, consider tuning rules or ML model retraining.")
            if perf.get("risk_rate", 0) > 20:
                recs.append("High risk rate, investigate exceptions closely.")
            if not recs:
                recs.append("System performing well.")
        except Exception as e:
            recs.append(f"Recommendation generation failed: {str(e)}")
        return recs


def main():
    import time

    start = time.time()
    try:
        input_data = json.loads(sys.stdin.read())
        engine = AnalyticsEngine()

        account_id = input_data.get("account_id")
        reconciliation_data = input_data.get("reconciliation_data", {})
        transactions = input_data.get("transactions", [])
        matches = input_data.get("matches", [])

        perf = engine.calculate_performance_metrics(reconciliation_data)
        patterns = engine.analyze_transaction_patterns(transactions)
        insights = engine.generate_matching_insights(matches)
        recs = engine.generate_recommendations(perf)

        result = {
            "success": True,
            "analytics": {
                "performance_metrics": perf,
                "transaction_patterns": patterns,
                "matching_insights": insights,
                "recommendations": recs,
                "generated_at": datetime.now().isoformat(),
                "account_id": account_id,
                "processing_time": round(time.time() - start, 3),
            },
        }
        print(json.dumps(result, default=str))  # ✅ Only JSON
    except Exception as e:
        error_result = {"success": False, "error": str(e)}
        print(json.dumps(error_result, default=str))  # ✅ Error bhi JSON


if __name__ == "__main__":
    main()
