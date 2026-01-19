import pandas as pd
import numpy as np
from datetime import datetime
import re
from typing import List, Dict, Optional
import logging
from dataclasses import dataclass, asdict
import chardet
from pathlib import Path

@dataclass
class ColumnMapping:
    date_column: str
    amount_column: str
    description_column: str
    reference_column: Optional[str] = None
    type_column: Optional[str] = None

@dataclass
class ProcessedTransaction:
    original_row: int
    date: datetime
    amount: float
    description: str
    reference: str = ""            
    transaction_type: str = ""     
    raw_data: Dict = None          

    def to_dict(self):
        """Convert dataclass to JSON-safe dict"""
        d = asdict(self)
        d["date"] = self.date.isoformat() if self.date else None
        return d

class FileProcessor:
    def __init__(self):
        self.logger = logging.getLogger(__name__)
        self.date_formats = [
            '%d/%m/%Y', '%m/%d/%Y', '%Y/%m/%d',
            '%d-%m-%Y', '%m-%d-%Y', '%Y-%m-%d',
            '%d.%m.%Y', '%Y.%m.%d',
            '%d %b %Y', '%d %B %Y',
            '%b %d, %Y', '%B %d, %Y',
            '%d/%m/%y', '%m/%d/%y', '%y/%m/%d'
        ]
        self.amount_patterns = [
            r'^-?\d+\.?\d*$',
            r'^-?\d{1,3}(,\d{3})*\.?\d*$',
            r'^-?₹\s*\d+\.?\d*$',
            r'^-?\$\s*\d+\.?\d*$',
            r'^-?\d+\.?\d*\s*(CR|DR)$',
        ]
        self.bank_formats = {
            'hdfc': {
                'date_formats': ['%d/%m/%Y', '%d-%m-%Y'],
                'amount_column_names': ['amount', 'debit', 'credit', 'transaction_amount'],
                'description_column_names': ['description', 'narration', 'particulars', 'transaction_details']
            },
            'icici': {
                'date_formats': ['%m/%d/%Y', '%Y-%m-%d'],
                'amount_column_names': ['amount', 'debit_amount', 'credit_amount', 'txn_amount'],
                'description_column_names': ['description', 'transaction_remarks', 'narration']
            },
            'sbi': {
                'date_formats': ['%d %b %Y', '%d/%m/%Y'],
                'amount_column_names': ['amount', 'debit', 'credit', 'withdrawal', 'deposit'],
                'description_column_names': ['description', 'narration', 'remarks']
            },
            'axis': {
                'date_formats': ['%d-%m-%Y', '%Y/%m/%d'],
                'amount_column_names': ['amount', 'debit_amt', 'credit_amt', 'txn_amt'],
                'description_column_names': ['particulars', 'description', 'narration']
            }
        }

    def detect_encoding(self, file_path: str) -> str:
        try:
            with open(file_path, 'rb') as file:
                raw_data = file.read()
                result = chardet.detect(raw_data)
                return result['encoding'] if result['confidence'] > 0.7 else 'utf-8'
        except Exception as e:
            self.logger.warning(f"Encoding detection failed: {e}, using utf-8")
            return 'utf-8'

    def read_file(self, file_path: str) -> pd.DataFrame:
        file_path = Path(file_path)
        ext = file_path.suffix.lower()
        try:
            if ext == '.csv':
                encoding = self.detect_encoding(file_path)
                for sep in [',', ';', '\t', '|']:
                    try:
                        df = pd.read_csv(file_path, encoding=encoding, sep=sep,
                                         low_memory=False, na_values=['', 'NULL', 'null', 'N/A', 'n/a'])
                        if len(df.columns) > 2:
                            return df
                    except Exception:
                        continue
                return pd.read_csv(file_path, encoding='utf-8', low_memory=False)

            elif ext in ['.xlsx', '.xls']:
                try:
                    return pd.read_excel(file_path, engine="openpyxl")
                except Exception:
                    return pd.read_excel(file_path, engine="xlrd")
            else:
                raise ValueError(f"Unsupported file format: {ext}")
        except Exception as e:
            self.logger.error(f"Error reading {file_path}: {e}")
            raise

    def detect_column_types(self, df: pd.DataFrame) -> Dict[str, List[str]]:
        cols = {'date_columns': [], 'amount_columns': [], 'description_columns': [], 'reference_columns': []}
        for col in df.columns:
            col_l = str(col).lower().strip()
            sample = df[col].dropna().head(20).astype(str)

            if sum(self.is_date_like(v) for v in sample) > len(sample) * 0.6:
                cols['date_columns'].append(col); continue
            if sum(self.is_amount_like(v) for v in sample) > len(sample) * 0.7:
                cols['amount_columns'].append(col); continue
            if any(k in col_l for k in ['description','narration','particulars','remarks','details','transaction']):
                cols['description_columns'].append(col); continue
            if any(k in col_l for k in ['reference','ref','cheque','transaction_id','txn_id','utr']):
                cols['reference_columns'].append(col); continue
            if sample.str.len().mean() > 15:
                cols['description_columns'].append(col)
        return cols

    def is_date_like(self, v: str) -> bool:
        v = str(v).strip()
        if not v: return False
        patterns = [
            r'^\d{1,2}[\/\-\.]\d{1,2}[\/\-\.]\d{2,4}$',
            r'^\d{4}[\/\-\.]\d{1,2}[\/\-\.]\d{1,2}$',
            r'^\d{1,2}\s+\w+\s+\d{2,4}$',
            r'^\w+\s+\d{1,2},?\s+\d{2,4}$',
        ]
        if any(re.match(p, v) for p in patterns): return True
        for fmt in self.date_formats:
            try: datetime.strptime(v, fmt); return True
            except: continue
        return False

    def is_amount_like(self, v: str) -> bool:
        v = str(v).strip()
        if not v: return False
        if any(re.match(p, v, re.IGNORECASE) for p in self.amount_patterns): return True
        try:
            c = re.sub(r'[₹$,\s]', '', v)
            c = re.sub(r'(CR|DR)$', '', c, flags=re.IGNORECASE)
            float(c); return True
        except: return False

    def parse_date(self, v) -> Optional[datetime]:
        if pd.isna(v): return None
        if isinstance(v, (pd.Timestamp, datetime)): return v.to_pydatetime() if hasattr(v, "to_pydatetime") else v
        s = str(v).strip()
        for fmt in self.date_formats:
            try: return datetime.strptime(s, fmt)
            except: continue
        try: return pd.to_datetime(s, errors="coerce").to_pydatetime()
        except: return None

    def parse_amount(self, v) -> float:
        if pd.isna(v): return 0.0
        if isinstance(v, (int, float)): return float(v)
        s = str(v).strip()
        is_credit = 'CR' in s.upper(); is_debit = 'DR' in s.upper()
        c = re.sub(r'[₹$,\s]', '', s)
        c = re.sub(r'(CR|DR)$', '', c, flags=re.IGNORECASE)
        c = c.replace('(', '-').replace(')', '')
        try:
            amt = float(c)
            if is_debit and amt > 0: amt = -amt
            if is_credit and amt < 0: amt = abs(amt)
            return amt
        except: return 0.0

    def clean_description(self, d: str) -> str:
        if pd.isna(d): return ""
        d = str(d).strip()
        d = re.sub(r'\s+', ' ', d)
        d = re.sub(r'[^\w\s\-\.\,\(\)\[\]]', ' ', d)
        return d.strip()

    def auto_detect_mapping(self, df: pd.DataFrame, bank: Optional[str] = None) -> ColumnMapping:
        cols = self.detect_column_types(df)
        date_col = (next((c for c in cols['date_columns'] if 'date' in str(c).lower()), None)
                    or (cols['date_columns'][0] if cols['date_columns'] else None))
        amt_col = (next((c for c in cols['amount_columns'] if 'amount' in str(c).lower()), None)
                   or (cols['amount_columns'][0] if cols['amount_columns'] else None))
        desc_col = (next((c for c in cols['description_columns'] if 'description' in str(c).lower()), None)
                    or (cols['description_columns'][0] if cols['description_columns'] else None))
        ref_col = cols['reference_columns'][0] if cols['reference_columns'] else None

        if bank and bank.lower() in self.bank_formats:
            cfg = self.bank_formats[bank.lower()]
            for col in df.columns:
                cl = str(col).lower()
                if not amt_col and any(n in cl for n in cfg['amount_column_names']): amt_col = col
                if not desc_col and any(n in cl for n in cfg['description_column_names']): desc_col = col
        return ColumnMapping(date_col, amt_col, desc_col, ref_col)

    def process_transactions(self, df: pd.DataFrame, mapping: ColumnMapping,
                             bank: Optional[str] = None) -> List[ProcessedTransaction]:
        txns = []
        for idx, row in df.iterrows():
            try:
                d = self.parse_date(row[mapping.date_column]) if mapping.date_column else None
                if not d: continue
                amt = self.parse_amount(row[mapping.amount_column]) if mapping.amount_column else 0
                desc = self.clean_description(row[mapping.description_column]) if mapping.description_column else ""
                ref = self.clean_description(row[mapping.reference_column]) if mapping.reference_column else ""
                ttype = "debit" if amt < 0 else "credit"
                txns.append(ProcessedTransaction(
                    original_row=idx, date=d, amount=amt,
                    description=desc, reference=ref, transaction_type=ttype, raw_data=row.to_dict()
                ))
            except Exception as e:
                self.logger.error(f"Error row {idx}: {e}")
                continue
        return txns

    def validate_transactions(self, txns: List[ProcessedTransaction]) -> Dict[str, List]:
        issues = {'missing_dates': [], 'zero_amounts': [], 'missing_descriptions': [], 'duplicate_transactions': []}
        seen = set()
        for i, t in enumerate(txns):
            if not t.date: issues['missing_dates'].append(i)
            if abs(t.amount) < 0.01: issues['zero_amounts'].append(i)
            if not t.description or len(t.description) < 3: issues['missing_descriptions'].append(i)
            key = (t.date.strftime('%Y-%m-%d') if t.date else "NA", t.amount, t.description[:50])
            if key in seen: issues['duplicate_transactions'].append(i)
            else: seen.add(key)
        return issues

    def process_file(self, file_path: str, mapping: Optional[ColumnMapping] = None,
                     bank: Optional[str] = None) -> Dict:
        try:
            df = self.read_file(file_path)
            mapping = mapping or self.auto_detect_mapping(df, bank)
            if not mapping.date_column or not mapping.amount_column:
                raise ValueError("Could not detect date and amount columns")

            txns = self.process_transactions(df, mapping, bank)
            validation = self.validate_transactions(txns)

            return {
                'success': True,
                'transactions': [t.to_dict() for t in txns],
                'total_processed': len(txns),
                'original_rows': len(df),
                'mapping_used': asdict(mapping),
                'validation_issues': validation,
                'column_types': self.detect_column_types(df),
                'file_info': {
                    'name': Path(file_path).name,
                    'size': Path(file_path).stat().st_size,
                    'columns': list(df.columns),
                    'detected_bank': bank
                }
            }
        except Exception as e:
            self.logger.error(f"File processing failed: {e}")
            return {'success': False, 'error': str(e), 'transactions': [], 'total_processed': 0}

if __name__ == "__main__":
    processor = FileProcessor()
    file_path = "sample_bank_statement.xlsx"
    result = processor.process_file(file_path, bank="hdfc")
    print(result)
