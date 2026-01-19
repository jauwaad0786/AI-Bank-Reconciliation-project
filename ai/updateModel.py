# ai/updateModel.py
import json
import sys
import pickle
import numpy as np
from datetime import datetime
from typing import Dict, List
from sklearn.ensemble import RandomForestClassifier
import xgboost as xgb
from fileProcessor import ProcessedTransaction
from advancedMatcher import AdvancedMatcher

class ModelUpdater:
    def __init__(self):
        self.matcher = AdvancedMatcher()
        self.feedback_history = []
        
    def load_existing_model(self, model_path: str) -> bool:
        """Load existing trained model"""
        try:
            with open(model_path, 'rb') as f:
                model_data = pickle.load(f)
            
            self.matcher.models = model_data.get('models', {})
            self.matcher.feature_scaler = model_data.get('feature_scaler')
            self.matcher.tfidf_vectorizer = model_data.get('tfidf_vectorizer')
            self.matcher.model_trained = True
            
            return True
        except Exception as e:
            print(f"Error loading model: {e}")
            return False
    
    def update_with_feedback(self, session_id: str, bank_txn_data: Dict, 
                           book_txn_data: Dict, is_correct: bool, model_path: str) -> Dict:
        """Update model with user feedback"""
        try:
            # Create transaction objects
            bank_txn = ProcessedTransaction(
                original_row=bank_txn_data.get('id', 0),
                date=datetime.fromisoformat(bank_txn_data['date']),
                amount=float(bank_txn_data['amount']),
                description=bank_txn_data['description'],
                reference=bank_txn_data.get('reference', ''),
                transaction_type=bank_txn_data.get('transaction_type', 'unknown'),
                raw_data=bank_txn_data
            )
            
            book_txn = ProcessedTransaction(
                original_row=book_txn_data.get('id', 0),
                date=datetime.fromisoformat(book_txn_data['date']),
                amount=float(book_txn_data['amount']),
                description=book_txn_data['description'],
                reference=book_txn_data.get('reference', ''),
                transaction_type=book_txn_data.get('transaction_type', 'unknown'),
                raw_data=book_txn_data
            )
            
            # Extract features
            features = self.matcher.extract_advanced_features(bank_txn, book_txn)
            
            # Store feedback
            feedback_entry = {
                'session_id': session_id,
                'features': features.tolist(),
                'label': 1 if is_correct else 0,
                'timestamp': datetime.now().isoformat(),
                'bank_txn_id': bank_txn_data.get('id'),
                'book_txn_id': book_txn_data.get('id')
            }
            
            self.feedback_history.append(feedback_entry)
            
            # If we have enough feedback, perform incremental update
            if len(self.feedback_history) >= 10:  # Batch update every 10 feedbacks
                self._perform_incremental_update(model_path)
            
            return {
                'success': True,
                'message': 'Feedback recorded successfully',
                'feedback_count': len(self.feedback_history)
            }
            
        except Exception as e:
            return {
                'success': False,
                'error': f'Feedback update failed: {str(e)}'
            }
    
    def _perform_incremental_update(self, model_path: str):
        """Perform incremental model update with accumulated feedback"""
        try:
            if not self.feedback_history:
                return
            
            # Prepare training data from feedback
            X_new = np.array([entry['features'] for entry in self.feedback_history])
            y_new = np.array([entry['label'] for entry in self.feedback_history])
            
            # Scale features
            if self.matcher.feature_scaler:
                X_new_scaled = self.matcher.feature_scaler.transform(X_new)
            else:
                X_new_scaled = X_new
            
            # Update each model with partial fit or retrain
            for model_name, model in self.matcher.models.items():
                try:
                    if hasattr(model, 'partial_fit'):
                        # For models supporting incremental learning
                        model.partial_fit(X_new_scaled, y_new)
                    else:
                        # For other models, we'll need to retrain with expanded dataset
                        # This is a simplified approach - in production, you'd want to 
                        # maintain a larger training dataset
                        pass
                        
                except Exception as e:
                    print(f"Error updating {model_name}: {e}")
            
            # Save updated model
            self._save_updated_model(model_path)
            
            # Clear feedback history after successful update
            self.feedback_history = []
            
        except Exception as e:
            print(f"Incremental update failed: {e}")
    
    def _save_updated_model(self, model_path: str):
        """Save updated model with feedback incorporated"""
        try:
            model_data = {
                'models': self.matcher.models,
                'feature_scaler': self.matcher.feature_scaler,
                'tfidf_vectorizer': self.matcher.tfidf_vectorizer,
                'last_updated': datetime.now().isoformat(),
                'feedback_incorporated': len(self.feedback_history),
                'model_version': '1.1'  # Increment version
            }
            
            with open(model_path, 'wb') as f:
                pickle.dump(model_data, f)
                
        except Exception as e:
            print(f"Error saving updated model: {e}")

def main():
    try:
        # Read input from stdin
        input_data = json.loads(sys.stdin.read())
        
        updater = ModelUpdater()
        
        # Extract parameters
        session_id = input_data.get('session_id')
        bank_txn_data = input_data.get('bank_txn_data')
        book_txn_data = input_data.get('book_txn_data') 
        is_correct = input_data.get('is_correct', False)
        model_path = input_data.get('model_path', 'trained_models.pkl')
        
        # Load existing model
        if not updater.load_existing_model(model_path):
            raise Exception("Failed to load existing model")
        
        # Update with feedback
        result = updater.update_with_feedback(
            session_id, bank_txn_data, book_txn_data, is_correct, model_path
        )
        
        print(json.dumps(result))
        
    except Exception as e:
        error_result = {
            'success': False,
            'error': str(e)
        }
        print(json.dumps(error_result))

if __name__ == "__main__":
    main()