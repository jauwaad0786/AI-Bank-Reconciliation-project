#!/usr/bin/env python3
import sys
import json
import re
import time
from datetime import datetime, timedelta
from difflib import SequenceMatcher
from collections import defaultdict

def try_parse_date(s):
    if s is None or str(s).strip() == "":
        return None
    s = str(s).strip()
    try:
        return datetime.fromisoformat(s.replace("Z", "+00:00")).date()
    except:
        pass
    fmts = ["%Y-%m-%d", "%d-%m-%Y", "%m-%d-%Y", "%Y/%m/%d", "%d/%m/%Y", 
            "%m/%d/%Y", "%d.%m.%Y", "%Y.%m.%d"]
    for fmt in fmts:
        try:
            return datetime.strptime(s, fmt).date()
        except:
            continue
    return None

def normalize_amount(x):
    if x is None:
        return None
    s = str(x).replace(",", "").replace("₹", "").replace("$", "").strip()
    if s.startswith("(") and s.endswith(")"):
        s = "-" + s[1:-1]
    try:
        return float(s)
    except:
        m = re.search(r"-?\d+(\.\d+)?", s)
        return float(m.group(0)) if m else None

def extract_reference_numbers(text):
    """Extract all possible reference numbers from text"""
    if not text:
        return set()
    
    s = str(text).upper()
    refs = set()
    
    patterns = [
        r"CCD\s*ID[:\s]*(\d+)",
        r"UTR[:\s]*(\d+)",
        r"REF[:\s]*(\d+)",
        r"REFERENCE[:\s]*(\d+)",
        r"TRANSACTION[#:\s]*(\d+)",
        r"\b(\d{12,})\b",  # Very long numbers (12+)
        r"\b(\d{10,11})\b",  # Long numbers (10-11)
        r"\b(\d{6,9})\b"   # Medium numbers (6-9)
    ]
    
    for p in patterns:
        matches = re.findall(p, s)
        refs.update(matches)
    
    return refs

def extract_key_terms(text):
    """Extract key financial terms and vendor names"""
    if not text:
        return set()
    
    text_lower = str(text).lower()
    
    # Common payment methods and types
    payment_terms = {
        'bankcard', 'mtot', 'deposit', 'withdrawal', 'transfer', 'payment',
        'check', 'cheque', 'ach', 'wire', 'fedex', 'fedwire', 'online',
        'remote', 'card', 'debit', 'credit', 'purchase', 'refund'
    }
    
    # Extract all alphanumeric sequences (words)
    words = set(re.findall(r'\b[a-z]{3,}\b', text_lower))
    
    # Keep only meaningful terms
    key_terms = words & payment_terms
    
    # Also keep any capitalized sequences (likely vendor names)
    vendor_pattern = r'\b[A-Z][a-z]+(?:\s+[A-Z][a-z]+)*\b'
    vendors = set(re.findall(vendor_pattern, text))
    
    return key_terms | {v.lower() for v in vendors}

def fuzzy_desc_match(a, b):
    if not a or not b:
        return 0.0
    
    a_lower = str(a).lower()
    b_lower = str(b).lower()
    
    # Exact match
    if a_lower == b_lower:
        return 1.0
    
    # Substring match (one contains the other)
    if a_lower in b_lower or b_lower in a_lower:
        shorter = min(len(a_lower), len(b_lower))
        longer = max(len(a_lower), len(b_lower))
        # give high score for substring but scale slightly by length ratio
        return 0.90 + (0.10 * shorter / longer)
    
    # Noise words to remove for token-based comparison
    noise = {'the', 'and', 'or', 'to', 'from', 'for', 'of', 'in', 'on', 'at', 
             'a', 'an', 'by', 'with', 'card', 'purchase', 'payment', 'transfer',
             'transaction', 'ref', 'id', 'no', 'date', 'via'}
    
    a_words = set(re.findall(r'\w+', a_lower)) - noise
    b_words = set(re.findall(r'\w+', b_lower)) - noise
    
    # Jaccard similarity with boosting
    jaccard = 0.0
    if a_words or b_words:
        intersection = len(a_words & b_words)
        union = len(a_words | b_words)
        jaccard = intersection / union if union > 0 else 0.0
        
        # Strong boost for multiple word matches
        if intersection >= 4:
            return max(jaccard, 0.85)
        if intersection >= 3:
            return max(jaccard, 0.75)
        if intersection >= 2:
            return max(jaccard, 0.65)
        if intersection >= 1:
            return max(jaccard, 0.45)
    
    # Character-level similarity fallback
    char_sim = SequenceMatcher(None, a_lower, b_lower).ratio()
    
    # If character similarity is high, use it
    if char_sim >= 0.8:
        return max(char_sim, jaccard, 0.75)
    
    # Weighted average fallback
    return max(jaccard, char_sim * 0.9)

def generate_transaction_key(row):
    """Generate unique key for transaction deduplication"""
    date = row.get("_date")
    amount = row.get("_amount")
    desc = row.get("_desc", "")[:50]
    
    date_str = date.isoformat() if date else "nodate"
    amt_str = f"{amount:.2f}" if amount is not None else "noamt"
    desc_normalized = re.sub(r'\s+', '', desc.lower())[:30]
    
    return f"{date_str}|{amt_str}|{desc_normalized}"

def deduplicate_transactions(rows):
    """Remove exact duplicates while preserving original row data"""
    seen_keys = {}
    unique_rows = []
    duplicate_count = 0
    
    for idx, row in enumerate(rows):
        key = generate_transaction_key(row)
        
        if key in seen_keys:
            duplicate_count += 1
            continue
        
        seen_keys[key] = idx
        unique_rows.append(row)
    
    return unique_rows, duplicate_count

def prepare_rows(rows):
    out = []
    for r in rows:
        row = dict(r)
        parsed_date = try_parse_date(row.get("date") or row.get("Date") or row.get("Transaction date"))
        norm_amount = normalize_amount(row.get("amount") or row.get("Amount"))
        
        desc = str(row.get("description") or row.get("Description") or row.get("Memo/Description") or "").strip()
        ref_val = str(row.get("reference") or row.get("Reference") or "").strip()
        
        # Extract all reference numbers
        all_refs = extract_reference_numbers(desc)
        if ref_val:
            all_refs.update(extract_reference_numbers(ref_val))
        
        # Extract key terms for better matching
        key_terms = extract_key_terms(desc)
        
        row["_date"] = parsed_date
        row["_amount"] = norm_amount
        row["_desc"] = desc.lower()
        row["_refs"] = all_refs
        row["_key_terms"] = key_terms
        row["_matched"] = False
        out.append(row)
    
    unique_rows, dup_count = deduplicate_transactions(out)
    return unique_rows, dup_count

def _strict_reference_check(bank, book, config):
    """
    Returns (passed: bool, reason_str)
    Strict check: amount within absolute OR pct tolerance AND date within days tolerance.
    """
    b_amt = bank.get("_amount")
    bk_amt = book.get("_amount")
    b_date = bank.get("_date")
    bk_date = book.get("_date")
    
    # Configurable strict tolerances (defaults)
    abs_tol = config.get("ref_amount_tol_abs", 5)           # ₹5 absolute
    pct_tol = config.get("ref_amount_tol_pct", 5)           # 5 percent
    date_tol_days = config.get("ref_date_tol_days", 3)      # 3 days

    # If amounts or dates missing -> cannot pass strict check
    if b_amt is None or bk_amt is None or b_date is None or bk_date is None:
        return False, "Ref present but missing amount/date for strict check"
    
    amt_diff = abs(b_amt - bk_amt)
    amt_pct_diff = (amt_diff / max(abs(b_amt), abs(bk_amt))) * 100 if max(abs(b_amt), abs(bk_amt)) != 0 else 100.0
    date_diff_days = abs((b_date - bk_date).days)
    
    amt_valid = (amt_diff <= abs_tol) or (amt_pct_diff <= pct_tol)
    date_valid = (date_diff_days <= date_tol_days)
    
    reason = f"amt_diff={amt_diff:.2f},amt_pct={amt_pct_diff:.2f}%,date_diff={date_diff_days}d"
    return (amt_valid and date_valid), reason

def score_pair(bank, book, config):
    reasons = []
    score = 0.0
    match_basis = []  # Track what caused the match
    
    b_refs = bank.get("_refs", set())
    bk_refs = book.get("_refs", set())
    
    # Priority 1: Reference number match (STRICT validation now)
    ref_intersection = b_refs & bk_refs
    if ref_intersection:
        long_refs = [r for r in ref_intersection if len(r) >= 6]
        # Try strict check
        passed, reason_str = _strict_reference_check(bank, book, config)
        if passed:
            # If strict check passes, return strong match
            ref_used = long_refs[:2] if long_refs else list(ref_intersection)[:2]
            match_basis.append("Exact Reference ID (strict)")
            return 0.98, [f"Reference match (strict): {','.join(ref_used)}", reason_str], "Exact Reference ID (strict)"
        else:
            # Do NOT return; record reason and continue to normal scoring
            reasons.append(f"Reference present but strict checks failed ({reason_str})")
            match_basis.append("Reference Present (failed strict)")
            # Continue with amount/date/description matching below
    
    b_amt = bank.get("_amount")
    bk_amt = book.get("_amount")
    
    if b_amt is None or bk_amt is None:
        return 0.0, ["Missing amount"], "No Match - Missing Amount"
    
    amt_tol = config.get("amount_tolerance", 10)
    amt_diff = abs(b_amt - bk_amt)
    
    # Priority 2: Amount matching
    if amt_diff == 0:
        score += 0.40
        reasons.append("Exact amount")
        match_basis.append("Exact Amount")
    elif amt_diff <= 0.01:
        score += 0.38
        reasons.append(f"Amount ±{amt_diff:.2f}")
        match_basis.append("Near Exact Amount")
    elif amt_diff <= 1.0:
        score += 0.35
        reasons.append(f"Amount ±{amt_diff:.2f}")
        match_basis.append("Similar Amount")
    elif amt_diff <= amt_tol:
        score += 0.30 * (1 - amt_diff/amt_tol)
        reasons.append(f"Amount ±{amt_diff:.2f}")
        match_basis.append("Amount Within Tolerance")
    else:
        pct_diff = abs(amt_diff) / max(abs(b_amt), abs(bk_amt)) * 100
        if pct_diff < 5:
            score += 0.20
            reasons.append(f"Amount {pct_diff:.1f}% diff")
            match_basis.append("Amount % Match")
        elif pct_diff < 10:
            score += 0.10
            reasons.append(f"Amount {pct_diff:.1f}% diff")
            match_basis.append("Amount % Match")
        else:
            return 0.0, [f"Amount diff {amt_diff:.2f} exceeds tolerance"], "No Match - Amount Difference"
    
    b_date = bank.get("_date")
    bk_date = book.get("_date")
    
    # Priority 3: Date matching - STRICT ENFORCEMENT
    date_tol = config.get("date_tolerance_days", 7)  # Default 7 days
    
    if b_date and bk_date:
        d_diff = abs((b_date - bk_date).days)
        
        # STRICT: If date difference exceeds tolerance, reject the match
        if d_diff > date_tol:
            return 0.0, [f"Date diff {d_diff}d exceeds tolerance {date_tol}d"], "No Match - Date Difference"
        
        # Within tolerance - score based on proximity
        if d_diff == 0:
            score += 0.30
            reasons.append("Same date")
            match_basis.append("Exact Date")
        elif d_diff == 1:
            score += 0.28
            reasons.append("±1 day")
            match_basis.append("Date ±1 Day")
        elif d_diff == 2:
            score += 0.26
            reasons.append("±2 days")
            match_basis.append("Date ±2 Days")
        elif d_diff <= 5:
            score += 0.24 * (1 - (d_diff - 2) / 3)
            reasons.append(f"Date ±{d_diff}d")
            match_basis.append(f"Date ±{d_diff} Days")
        else:
            # Within tolerance but further out
            score += 0.15 * (1 - (d_diff - 5) / (date_tol - 5 + 1))
            reasons.append(f"Date ±{d_diff}d")
            match_basis.append(f"Date ±{d_diff} Days")
    else:
        # STRICT: If either date is missing, reject the match
        return 0.0, ["Date missing - cannot validate"], "No Match - Missing Date"
    
    # Priority 4: Description similarity
    b_desc = bank.get("_desc", "")
    bk_desc = book.get("_desc", "")
    
    desc_sim = fuzzy_desc_match(b_desc, bk_desc)
    if desc_sim >= 0.25:
        score += 0.30 * desc_sim
        reasons.append(f"Desc {int(desc_sim*100)}%")
        if desc_sim >= 0.8:
            match_basis.append("Strong Description Match")
        elif desc_sim >= 0.5:
            match_basis.append("Good Description Match")
        else:
            match_basis.append("Partial Description Match")
    
    # Priority 5: Key terms matching
    b_terms = bank.get("_key_terms", set())
    bk_terms = book.get("_key_terms", set())
    
    if b_terms and bk_terms:
        term_overlap = len(b_terms & bk_terms)
        if term_overlap > 0:
            term_score = min(0.10, term_overlap * 0.03)
            score += term_score
            reasons.append(f"Terms match: {term_overlap}")
            match_basis.append("Key Terms Match")
    
    # Final match basis
    final_match_basis = " + ".join(match_basis) if match_basis else "Multiple Factors"
    
    return min(score, 1.0), reasons, final_match_basis

def match_transactions_optimized(bank_rows, book_rows, config):
    bank, bank_dups = prepare_rows(bank_rows)
    book, book_dups = prepare_rows(book_rows)
    
    matches = []
    book_used = set()
    bank_matched = set()
    
    # Pass 1: Exact reference matches (STRICT check applied)
    for b_idx, b in enumerate(bank):
        b_refs = b.get("_refs", set())
        if not b_refs:
            continue
        
        for bk_idx, bk in enumerate(book):
            if bk_idx in book_used:
                continue
            
            bk_refs = bk.get("_refs", set())
            ref_match = b_refs & bk_refs
            
            if ref_match:
                passed, reason_str = _strict_reference_check(b, bk, config)
                if passed:
                    ref_used = [r for r in ref_match if len(r) >= 6][:2] or list(ref_match)[:2]
                    matches.append({
                        "bank_row": clean_row(b),
                        "book_row": clean_row(bk),
                        "confidence": 0.98,
                        "match_type": "exact",
                        "reason": f"Reference (strict): {','.join(ref_used)}; {reason_str}",
                        "match_basis": "Exact Reference ID (strict)"
                    })
                    book_used.add(bk_idx)
                    bank_matched.add(b_idx)
                    break
                else:
                    # If strict check fails, do not match here; allow other logic below to try
                    # (we do not break so that other book rows could be evaluated)
                    continue
    
    # Pass 2: Amount and date based matching (bucketed by amount)
    amt_tol = config.get("amount_tolerance", 15)
    amount_index = defaultdict(list)
    
    for idx, bk in enumerate(book):
        if idx in book_used:
            continue
        amt = bk.get("_amount")
        if amt is not None:
            # bucket by integer division to limit candidate search
            bucket = int(amt / amt_tol) if amt_tol != 0 else 0
            for buck in [bucket-2, bucket-1, bucket, bucket+1, bucket+2]:
                amount_index[buck].append(idx)
    
    unmatched_bank = []
    
    for b_idx, b in enumerate(bank):
        if b_idx in bank_matched:
            continue
        
        b_amt = b.get("_amount")
        if b_amt is None:
            unmatched_bank.append({**clean_row(b), "unmatch_reason": "No amount"})
            continue
        
        bucket = int(b_amt / amt_tol) if amt_tol != 0 else 0
        candidates = set()
        for buck in [bucket-2, bucket-1, bucket, bucket+1, bucket+2]:
            candidates.update(amount_index.get(buck, []))
        
        best_score = 0.0
        best_book_idx = None
        best_reason = "No suitable match"
        best_match_basis = "No Match"
        
        for bk_idx in candidates:
            if bk_idx in book_used:
                continue
            
            bk = book[bk_idx]
            sc, reasons, match_basis_str = score_pair(b, bk, config)
            
            if sc > best_score:
                best_score = sc
                best_book_idx = bk_idx
                best_reason = "; ".join(reasons)
                best_match_basis = match_basis_str
        
        min_score = config.get("min_match_score", 0.40)
        
        if best_book_idx is not None and best_score >= min_score:
            book_used.add(best_book_idx)
            bank_matched.add(b_idx)
            matches.append({
                "bank_row": clean_row(b),
                "book_row": clean_row(book[best_book_idx]),
                "confidence": round(best_score, 3),
                "match_type": "exact" if best_score >= 0.80 else "probable",
                "reason": best_reason,
                "match_basis": best_match_basis
            })
        else:
            unmatched_bank.append({**clean_row(b), "unmatch_reason": best_reason})
    
    unmatched_bank_unique, unmatched_bank_dups = deduplicate_unmatched(unmatched_bank)
    
    unmatched_book = [
        {**clean_row(bk), "unmatch_reason": "No match found"}
        for i, bk in enumerate(book) if i not in book_used
    ]
    
    unmatched_book_unique, unmatched_book_dups = deduplicate_unmatched(unmatched_book)
    
    return (matches, unmatched_bank_unique, unmatched_book_unique, 
            bank_dups, book_dups, unmatched_bank_dups, unmatched_book_dups)

def deduplicate_unmatched(unmatched_list):
    """Deduplicate unmatched transactions"""
    seen_keys = {}
    unique = []
    dup_count = 0
    
    for row in unmatched_list:
        date_val = row.get("date") or row.get("Date") or row.get("Transaction date", "")
        amount_val = row.get("amount") or row.get("Amount", "")
        desc_val = str(row.get("description") or row.get("Description") or row.get("Memo/Description", ""))[:50]
        
        key = f"{date_val}|{amount_val}|{desc_val}"
        
        if key in seen_keys:
            dup_count += 1
            continue
        
        seen_keys[key] = True
        unique.append(row)
    
    return unique, dup_count

def clean_row(row):
    r = {}
    for k, v in row.items():
        if k.startswith("_"):
            continue
        if isinstance(v, datetime):
            r[k] = v.isoformat()
        else:
            r[k] = v
    
    if "_date" in row and row["_date"]:
        r["date"] = row["_date"].isoformat()
    if "_amount" in row:
        r["amount"] = row["_amount"]
    
    return r

def main():
    start = time.time()
    try:
        raw = sys.stdin.read()
        if not raw:
            raise ValueError("No input on stdin")
        
        payload = json.loads(raw)
        bank_txns = payload.get("bank_transactions", [])
        book_txns = payload.get("book_transactions", [])
        config = payload.get("config", {})
        
        # Set some safe defaults if not supplied
        config.setdefault("amount_tolerance", 10)
        config.setdefault("date_tolerance_days", 7)
        config.setdefault("min_match_score", 0.40)
        # Reference strict defaults
        config.setdefault("ref_amount_tol_abs", 5)
        config.setdefault("ref_amount_tol_pct", 5)
        config.setdefault("ref_date_tol_days", 3)
        
        (matches, unmatched_bank, unmatched_book, 
         bank_dups, book_dups, unmatched_bank_dups, unmatched_book_dups) = match_transactions_optimized(
            bank_txns, book_txns, config
        )
        
        total_bank = len(bank_txns)
        total_book = len(book_txns)
        total_matches = len(matches)
        match_rate = (total_matches / total_bank) * 100 if total_bank > 0 else 0.0
        
        result = {
            "success": True,
            "matches": matches,
            "unmatched_bank": unmatched_bank,
            "unmatched_book": unmatched_book,
            "summary": {
                "total_bank_transactions": total_bank,
                "total_book_transactions": total_book,
                "total_matches": total_matches,
                "unmatched_bank": len(unmatched_bank),
                "unmatched_book": len(unmatched_book),
                "match_rate": f"{match_rate:.2f}%",
                "duplicates_removed": {
                    "bank_input_duplicates": bank_dups,
                    "book_input_duplicates": book_dups,
                    "unmatched_bank_duplicates": unmatched_bank_dups,
                    "unmatched_book_duplicates": unmatched_book_dups
                }
            },
            "processing_time": round(time.time() - start, 3)
        }
        
        print(json.dumps(result, default=str))
        sys.exit(0)
        
    except Exception as e:
        error = {"success": False, "error": str(e), "type": type(e).__name__}
        print(json.dumps(error))
        sys.exit(1)

if __name__ == "__main__":
    main()