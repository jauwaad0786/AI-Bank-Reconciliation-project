# ai/anomalyDetector.py
import sys
import json
import re
import numpy as np
import pandas as pd
from collections import defaultdict
import warnings
warnings.filterwarnings('ignore')

# === Configuration ===
VENDOR_MIN_GROUP_SIZE = 5      # minimum transactions per vendor for statistical analysis
VENDOR_Z_THRESHOLD = 2.5       # z-score threshold (98.76% confidence)
SAMPLE_MAX = 3000              # limit for sampled transactions


class AnomalyDetector:
    def __init__(self):
        pass

    def read_input(self):
        """Read JSON input from Node.js"""
        try:
            raw = sys.stdin.read()
            return json.loads(raw)
        except Exception as e:
            return {"error": f"Failed to read input: {str(e)}"}

    def extract_vendor_name(self, txn):
        """Extract vendor name from Name column - exactly as written in QB"""
        # Direct check from 'Name' column (QuickBooks style)
        name = txn.get('Name') or txn.get('name')
        if name:
            s = str(name).strip()
            # Accept anything that's not empty or placeholder
            if s and s.lower() not in ['unknown', 'n/a', 'na', '', 'null', 'none', ' ']:
                return s  # Keep original case as in QB
        
        # Fallback: Check Memo/Description only if Name is empty
        memo = txn.get('Memo/Description') or txn.get('memo') or txn.get('description') or txn.get('Description')
        if memo:
            memo_str = str(memo).strip()
            if memo_str and len(memo_str) > 2 and memo_str.lower() not in ['unknown', 'n/a', 'na', '', 'null', 'none']:
                # Extract first meaningful word/phrase
                tokens = memo_str.split()
                if tokens:
                    # Take first 1-3 tokens as vendor name
                    vendor_name = ' '.join(tokens[:min(3, len(tokens))])
                    return vendor_name
        
        return None

    def extract_features(self, transactions):
        """Extract features for analysis"""
        txns = transactions
        if len(txns) > SAMPLE_MAX:
            txns = np.random.choice(txns, SAMPLE_MAX, replace=False).tolist()

        feats = []
        for idx, t in enumerate(txns):
            try:
                # Amount extraction
                amount = t.get('Amount') or t.get('amount')
                if amount is None:
                    amount = 0.0
                try:
                    amount = float(amount)
                except:
                    amount = 0.0

                # Date extraction
                date_raw = t.get('Transaction date') or t.get('date') or t.get('Date') or ''
                
                # Description/Memo extraction
                desc = str(t.get('Memo/Description') or t.get('memo') or t.get('description') or t.get('Description') or '').strip()
                
                # Vendor from Name column
                vendor = self.extract_vendor_name(t)
                
                # Check if description is missing/empty/space
                has_description = bool(desc and len(desc) > 1 and desc not in [' ', '  ', '   '])

                feats.append({
                    'index': idx,
                    'amount': amount,
                    'date_raw': date_raw,
                    'description': desc if has_description else '',
                    'vendor': vendor,
                    'has_description': has_description,
                    'original': t
                })
            except Exception:
                continue
        return feats

    def vendor_wise_outliers(self, feats):
        """
        Detect vendor-wise outliers using Empirical Rule
        Group by exact vendor names (as written in Name column)
        """
        groups = defaultdict(list)
        
        # Group by vendor
        for f in feats:
            if f['vendor']:
                groups[f['vendor']].append(f)

        outlier_indices = set()
        vendor_stats = {}
        vendor_outlier_details = {}
        
        for vendor, group in groups.items():
            if len(group) < VENDOR_MIN_GROUP_SIZE:
                continue
            
            amounts = np.array([g['amount'] for g in group], dtype=float)
            mean = float(np.mean(amounts))
            std = float(np.std(amounts, ddof=1))
            
            if std == 0 or np.isnan(std) or std < 0.01:
                continue
            
            vendor_stats[vendor] = {
                'mean': round(mean, 2),
                'std': round(std, 2),
                'count': len(group),
                'min': round(float(np.min(amounts)), 2),
                'max': round(float(np.max(amounts)), 2)
            }
            
            vendor_outliers = []
            
            for g in group:
                z = (g['amount'] - mean) / std
                
                # Flag if beyond 2.5 sigma and at least 30% deviation
                if abs(z) >= VENDOR_Z_THRESHOLD:
                    deviation_percent = abs(g['amount'] - mean) / mean if mean > 0 else 0
                    
                    if deviation_percent > 0.3:
                        outlier_indices.add(g['index'])
                        g['z_score'] = round(float(z), 2)
                        g['vendor_mean'] = round(mean, 2)
                        g['vendor_std'] = round(std, 2)
                        
                        vendor_outliers.append({
                            'amount': g['amount'],
                            'date': g['date_raw'],
                            'z_score': g['z_score'],
                            'deviation_percent': round(deviation_percent * 100, 1)
                        })
            
            if vendor_outliers:
                vendor_outlier_details[vendor] = {
                    'total_transactions': len(group),
                    'outliers_found': len(vendor_outliers),
                    'vendor_mean': round(mean, 2),
                    'vendor_std': round(std, 2),
                    'outliers': vendor_outliers
                }
        
        return outlier_indices, vendor_stats, vendor_outlier_details

    def calculate_risk_score_and_reasons(self, feature, vendor_outliers_idx_set):
        """
        Risk scoring focused on vendor anomalies:
        1. Vendor-wise statistical outlier = HIGH
        2. Missing vendor = MEDIUM
        3. Missing description/memo = LOW (if vendor present)
        """
        idx = feature['index']
        
        has_description = feature.get('has_description', False)
        has_vendor = bool(feature.get('vendor'))
        is_vendor_outlier = idx in vendor_outliers_idx_set

        # PRIORITY 1: Vendor-wise statistical outlier (HIGH RISK)
        if is_vendor_outlier:
            reasons = []
            z_score = feature.get('z_score', 0)
            vendor = feature.get('vendor', 'Unknown')
            mean = feature.get('vendor_mean', 0)
            std = feature.get('vendor_std', 0)
            
            deviation_percent = abs(feature['amount'] - mean) / mean * 100 if mean > 0 else 0
            
            reasons.append(f"🚨 VENDOR: {vendor}")
            reasons.append(f"Statistical Outlier Detected ({abs(z_score):.1f}σ deviation)")
            reasons.append(f"Transaction: ₹{feature['amount']:.2f} | Vendor Average: ₹{mean:.2f}")
            reasons.append(f"Deviation: {deviation_percent:.1f}% from typical amount")
            
            return 95, reasons, vendor, 'VENDOR_OUTLIER'

        # PRIORITY 2: Missing vendor (MEDIUM RISK)
        if not has_vendor:
            reasons = ["⚠️ MISSING VENDOR (Name column empty/unknown)"]
            if not has_description:
                reasons.append("Missing Memo/Description")
            return 60, reasons, 'NO VENDOR', 'MISSING_VENDOR'

        # PRIORITY 3: Missing description (LOW RISK - if vendor present)
        if not has_description:
            vendor = feature.get('vendor', 'Unknown')
            reasons = [
                f"📝 VENDOR: {vendor}",
                "Missing or empty Memo/Description"
            ]
            return 35, reasons, vendor, 'MISSING_DESCRIPTION'

        return 0, [], None, None

    def classify_risk(self, risk_score):
        if risk_score >= 80:
            return 'HIGH'
        elif risk_score >= 50:
            return 'MEDIUM'
        elif risk_score >= 30:
            return 'LOW'
        else:
            return 'NORMAL'

    def detect_anomalies(self, transactions):
        """Main detection - vendor-focused QB style"""
        if not transactions or len(transactions) == 0:
            return {
                'success': True,
                'anomalies': [],
                'summary': {
                    'total_transactions': 0,
                    'anomalies_detected': 0
                }
            }

        features = self.extract_features(transactions)
        if not features:
            return {
                'success': True,
                'anomalies': [],
                'summary': {
                    'total_transactions': len(transactions),
                    'anomalies_detected': 0
                }
            }

        # Vendor-wise outlier detection
        vendor_outliers, vendor_stats, vendor_outlier_details = self.vendor_wise_outliers(features)

        anomalies = []
        anomalies_by_vendor = defaultdict(list)
        anomalies_by_type = defaultdict(list)
        
        for f in features:
            idx = f['index']
            risk_score, reasons, vendor, anomaly_type = self.calculate_risk_score_and_reasons(
                f, vendor_outliers
            )

            if risk_score >= 30:  # Include LOW, MEDIUM, HIGH
                risk_level = self.classify_risk(risk_score)
                orig = f.get('original') or {}
                
                tx_date = orig.get('Transaction date') or orig.get('date') or orig.get('Date') or ''
                tx_amount = orig.get('Amount') or orig.get('amount')
                try:
                    tx_amount = float(tx_amount)
                except:
                    tx_amount = float(f.get('amount') or 0.0)
                
                tx_desc = orig.get('Memo/Description') or orig.get('description') or orig.get('Description') or ''
                tx_vendor = f.get('vendor') or 'NOT IDENTIFIED'

                anomaly_obj = {
                    'date': tx_date,
                    'amount': tx_amount,
                    'vendor': tx_vendor,
                    'description': tx_desc if tx_desc else '(Empty)',
                    'anomaly_type': anomaly_type,
                    'risk_score': risk_score,
                    'risk_level': risk_level,
                    'reasons': reasons,
                    'reasons_text': ' | '.join(reasons)
                }
                anomalies.append(anomaly_obj)
                
                # Group by vendor
                vendor_key = vendor or 'MISSING_VENDOR'
                anomalies_by_vendor[vendor_key].append({
                    'risk_level': risk_level,
                    'amount': tx_amount,
                    'type': anomaly_type
                })
                
                # Group by anomaly type
                if anomaly_type:
                    anomalies_by_type[anomaly_type].append(tx_vendor)

        # Create vendor-wise summary
        vendor_summary = {}
        for vendor, vendor_anomalies in anomalies_by_vendor.items():
            vendor_summary[vendor] = {
                'total_anomalies': len(vendor_anomalies),
                'high_risk': len([a for a in vendor_anomalies if a['risk_level'] == 'HIGH']),
                'medium_risk': len([a for a in vendor_anomalies if a['risk_level'] == 'MEDIUM']),
                'low_risk': len([a for a in vendor_anomalies if a['risk_level'] == 'LOW']),
                'total_amount_flagged': round(sum([a['amount'] for a in vendor_anomalies]), 2),
                'outliers': len([a for a in vendor_anomalies if a['type'] == 'VENDOR_OUTLIER']),
                'missing_description': len([a for a in vendor_anomalies if a['type'] == 'MISSING_DESCRIPTION'])
            }

        # Type-wise summary
        type_summary = {
            'vendor_outliers': len(anomalies_by_type.get('VENDOR_OUTLIER', [])),
            'missing_vendors': len(anomalies_by_type.get('MISSING_VENDOR', [])),
            'missing_descriptions': len(anomalies_by_type.get('MISSING_DESCRIPTION', []))
        }

        summary = {
            'total_transactions': len(transactions),
            'sampled_transactions': len(features),
            'anomalies_detected': len(anomalies),
            'high_risk': len([a for a in anomalies if a['risk_level'] == 'HIGH']),
            'medium_risk': len([a for a in anomalies if a['risk_level'] == 'MEDIUM']),
            'low_risk': len([a for a in anomalies if a['risk_level'] == 'LOW']),
            'vendors_analyzed': len(vendor_stats),
            'vendors_with_anomalies': len(anomalies_by_vendor),
            'anomaly_breakdown': type_summary,
            'vendor_wise_summary': vendor_summary,
            'vendor_statistics': vendor_stats,
            'vendor_outlier_details': vendor_outlier_details
        }

        return {
            'success': True,
            'anomalies': anomalies,
            'summary': summary
        }


def main():
    try:
        detector = AnomalyDetector()
        input_data = detector.read_input()
        if 'error' in input_data:
            print(json.dumps({'success': False, 'error': input_data['error']}))
            sys.exit(1)

        bank_txns = input_data.get('bank_transactions', []) or []
        book_txns = input_data.get('book_transactions', []) or []
        all_txns = bank_txns + book_txns

        print(f"Processing {len(all_txns)} transactions", file=sys.stderr)
        result = detector.detect_anomalies(all_txns)
        print(json.dumps(result))
    except Exception as e:
        print(json.dumps({'success': False, 'error': str(e), 'anomalies': []}))
        sys.exit(1)


if __name__ == "__main__":
    main()