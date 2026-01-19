
import pandas as pd
import numpy as np
import json
import sys
import pickle
from datetime import datetime
from typing import List, Dict, Tuple
from sklearn.ensemble import RandomForestClassifier, GradientBoostingClassifier
from sklearn.linear_model import LogisticRegression
from sklearn.preprocessing import StandardScaler
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.model_selection import train_test_split, cross_val_score, GridSearchCV
from sklearn.metrics import classification_report, confusion_matrix, roc_auc_score
import xgboost as xgb
from fileProcessor import ProcessedTransaction
from advancedMatcher import AdvancedMatcher
import warnings
warnings.filterwarnings('ignore')

class ModelTrainer:
    def __init__(self):
        self.models = {
            'random_forest': RandomForestClassifier(random_state=42, n_jobs=-1),
            'xgboost': xgb.XGBClassifier(random_state=42, eval_metric='logloss'),
            'gradient_boost': GradientBoostingClassifier(random_state=42),
            'logistic_regression': LogisticRegression(random_state=42, max_iter=1000)
        }
        
        self.feature_scaler = StandardScaler()
        self.tfidf_vectorizer = TfidfVectorizer(
            max_features=5000,
            stop_words='english',
            ngram_range=(1, 2),
            lowercase=True
        )
        
        self.matcher = AdvancedMatcher()
        self.training_history = []
        
        # Hyperparameter grids for optimization
        self.param_grids = {
            'random_forest': {
                'n_estimators': [50, 100, 200],
                'max_depth': [10, 20, None],
                'min_samples_split': [2, 5, 10]
            },
            'xgboost': {
                'n_estimators': [50, 100, 200],
                'max_depth': [3, 6, 10],
                'learning_rate': [0.01, 0.1, 0.2]
            },
            'gradient_boost': {
                'n_estimators': [50, 100, 200],
                'max_depth': [3, 6, 10],
                'learning_rate': [0.01, 0.1, 0.2]
            }
        }
    
    def prepare_training_data(self, labeled_matches: List[Dict]) -> Tuple[np.ndarray, np.ndarray]:
        """Convert labeled matches to training features and labels"""
        features = []
        labels = []
        descriptions = []
        
        for match_data in labeled_matches:
            try:
                # Extract transaction data
                bank_txn_data = match_data['bank_transaction']
                book_txn_data = match_data['book_transaction']
                is_match = match_data['is_correct_match']
                
                # Create ProcessedTransaction objects
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
                
                # Extract features using the matcher's feature extraction
                feature_vector = self.matcher.extract_advanced_features(bank_txn, book_txn)
                
                features.append(feature_vector)
                labels.append(1 if is_match else 0)
                
                # Collect descriptions for TF-IDF
                descriptions.extend([
                    self.matcher.preprocess_text(bank_txn.description),
                    self.matcher.preprocess_text(book_txn.description)
                ])
                
            except Exception as e:
                print(f"Error processing training sample: {e}")
                continue
        
        if not features:
            raise ValueError("No valid training samples could be processed")
        
        # Fit TF-IDF vectorizer
        self.tfidf_vectorizer.fit(descriptions)
        
        # Convert to numpy arrays
        X = np.array(features)
        y = np.array(labels)
        
        # Scale features
        X_scaled = self.feature_scaler.fit_transform(X)
        
        return X_scaled, y
    
    def train_models(self, X: np.ndarray, y: np.ndarray, optimize_hyperparams: bool = True) -> Dict:
        """Train all models and return performance metrics"""
        training_results = {}
        
        # Split data for training and testing
        X_train, X_test, y_train, y_test = train_test_split(
            X, y, test_size=0.2, random_state=42, stratify=y
        )
        
        print(f"Training on {len(X_train)} samples, testing on {len(X_test)} samples")
        
        for model_name, model in self.models.items():
            print(f"\nTraining {model_name}...")
            
            try:
                # Hyperparameter optimization
                if optimize_hyperparams and model_name in self.param_grids:
                    print(f"Optimizing hyperparameters for {model_name}...")
                    grid_search = GridSearchCV(
                        model, self.param_grids[model_name],
                        cv=5, scoring='roc_auc', n_jobs=-1
                    )
                    grid_search.fit(X_train, y_train)
                    best_model = grid_search.best_estimator_
                    best_params = grid_search.best_params_
                    print(f"Best parameters: {best_params}")
                else:
                    best_model = model
                    best_params = {}
                
                # Train the model
                best_model.fit(X_train, y_train)
                
                # Make predictions
                train_pred = best_model.predict(X_train)
                test_pred = best_model.predict(X_test)
                
                # Get probabilities for AUC calculation
                if hasattr(best_model, 'predict_proba'):
                    train_proba = best_model.predict_proba(X_train)[:, 1]
                    test_proba = best_model.predict_proba(X_test)[:, 1]
                else:
                    train_proba = train_pred
                    test_proba = test_pred
                
                # Calculate metrics
                train_accuracy = best_model.score(X_train, y_train)
                test_accuracy = best_model.score(X_test, y_test)
                
                try:
                    train_auc = roc_auc_score(y_train, train_proba)
                    test_auc = roc_auc_score(y_test, test_proba)
                except:
                    train_auc = test_auc = 0.0
                
                # Cross-validation
                cv_scores = cross_val_score(best_model, X_train, y_train, cv=5)
                
                # Store results
                training_results[model_name] = {
                    'model': best_model,
                    'best_params': best_params,
                    'train_accuracy': float(train_accuracy),
                    'test_accuracy': float(test_accuracy),
                    'train_auc': float(train_auc),
                    'test_auc': float(test_auc),
                    'cv_mean': float(cv_scores.mean()),
                    'cv_std': float(cv_scores.std()),
                    'classification_report': classification_report(y_test, test_pred, output_dict=True),
                    'confusion_matrix': confusion_matrix(y_test, test_pred).tolist()
                }
                
                print(f"{model_name} - Train Acc: {train_accuracy:.3f}, Test Acc: {test_accuracy:.3f}, "
                      f"CV: {cv_scores.mean():.3f}±{cv_scores.std():.3f}")
                
                # Update model in matcher
                self.matcher.models[model_name.replace('_', '')] = best_model
                
            except Exception as e:
                print(f"Error training {model_name}: {e}")
                training_results[model_name] = {'error': str(e)}
        
        return training_results
    
    def evaluate_ensemble_performance(self, X_test: np.ndarray, y_test: np.ndarray) -> Dict:
        """Evaluate ensemble model performance"""
        try:
            ensemble_predictions = []
            model_weights = {
                'random_forest': 0.3,
                'xgboost': 0.3,
                'gradient_boost': 0.2,
                'logistic_regression': 0.2
            }
            
            # Get predictions from each model
            for model_name, weight in model_weights.items():
                model_key = model_name.replace('_', '')
                if model_key in self.matcher.models:
                    model = self.matcher.models[model_key]
                    if hasattr(model, 'predict_proba'):
                        prob = model.predict_proba(X_test)[:, 1]
                        ensemble_predictions.append(prob * weight)
            
            if ensemble_predictions:
                # Weighted average ensemble
                ensemble_proba = np.sum(ensemble_predictions, axis=0)
                ensemble_pred = (ensemble_proba >= 0.5).astype(int)
                
                # Calculate ensemble metrics
                ensemble_accuracy = (ensemble_pred == y_test).mean()
                ensemble_auc = roc_auc_score(y_test, ensemble_proba)
                
                return {
                    'ensemble_accuracy': float(ensemble_accuracy),
                    'ensemble_auc': float(ensemble_auc),
                    'ensemble_report': classification_report(y_test, ensemble_pred, output_dict=True)
                }
            
        except Exception as e:
            print(f"Ensemble evaluation error: {e}")
        
        return {}
    
    def generate_feature_importance(self, training_results: Dict) -> Dict:
        """Generate feature importance analysis"""
        importance_analysis = {}
        
        # Feature names (should match the order in extract_advanced_features)
        feature_names = [
            'date_diff_hours', 'date_proximity', 'bank_weekday', 'book_weekday', 'weekday_diff',
            'bank_day', 'book_day', 'bank_month', 'book_month',
            'amount_diff', 'amount_diff_normalized', 'amount_ratio', 'amount_log_diff',
            'bank_amount_abs', 'book_amount_abs', 'same_sign', 'exact_amount_match',
            'amount_within_1', 'amount_within_1_percent',
            'sequence_similarity', 'jaccard_similarity', 'reference_similarity',
            'bank_desc_length', 'book_desc_length', 'desc_length_diff',
            'bank_word_count', 'book_word_count', 'common_refs', 'bank_refs_count', 'book_refs_count'
        ]
        
        for model_name, results in training_results.items():
            if 'model' in results and hasattr(results['model'], 'feature_importances_'):
                importances = results['model'].feature_importances_
                
                # Create importance ranking
                importance_pairs = list(zip(feature_names[:len(importances)], importances))
                importance_pairs.sort(key=lambda x: x[1], reverse=True)
                
                importance_analysis[model_name] = {
                    'top_features': importance_pairs[:10],
                    'all_importances': dict(importance_pairs)
                }
        
        return importance_analysis
    
    def save_trained_models(self, model_path: str, training_results: Dict, 
                           feature_importance: Dict) -> bool:
        """Save all trained models and metadata"""
        try:
            # Prepare model data
            model_data = {
                'models': {name: results.get('model') for name, results in training_results.items() 
                          if 'model' in results},
                'feature_scaler': self.feature_scaler,
                'tfidf_vectorizer': self.tfidf_vectorizer,
                'training_results': {name: {k: v for k, v in results.items() if k != 'model'} 
                                   for name, results in training_results.items()},
                'feature_importance': feature_importance,
                'training_timestamp': datetime.now().isoformat(),
                'model_version': '1.0'
            }
            
            # Save to pickle file
            with open(model_path, 'wb') as f:
                pickle.dump(model_data, f)
            
            # Update matcher's models
            for name, model in model_data['models'].items():
                if model is not None:
                    self.matcher.models[name.replace('_', '')] = model
            
            self.matcher.feature_scaler = self.feature_scaler
            self.matcher.tfidf_vectorizer = self.tfidf_vectorizer
            self.matcher.model_trained = True
            
            print(f"Models saved successfully to {model_path}")
            return True
            
        except Exception as e:
            print(f"Error saving models: {e}")
            return False
    
    def load_training_history(self, history_path: str) -> List[Dict]:
        """Load previous training history"""
        try:
            with open(history_path, 'r') as f:
                return json.load(f)
        except:
            return []
    
    def save_training_history(self, history_path: str, training_session: Dict):
        """Save training session to history"""
        try:
            history = self.load_training_history(history_path)
            history.append(training_session)
            
            with open(history_path, 'w') as f:
                json.dump(history, f, indent=2, default=str)
        except Exception as e:
            print(f"Error saving training history: {e}")

def main():
    try:
        # Read input from stdin
        input_data = json.loads(sys.stdin.read())
        
        trainer = ModelTrainer()
        
        # Extract parameters
        training_data = input_data.get('training_data', [])
        model_path = input_data.get('model_path', 'trained_models.pkl')
        optimize_hyperparams = input_data.get('optimize_hyperparams', True)
        save_history = input_data.get('save_history', True)
        
        print(f"Starting training with {len(training_data)} labeled samples")
        
        # Prepare training data
        X, y = trainer.prepare_training_data(training_data)
        
        print(f"Feature matrix shape: {X.shape}")
        print(f"Label distribution - Positive: {np.sum(y)}, Negative: {len(y) - np.sum(y)}")
        
        # Train models
        training_results = trainer.train_models(X, y, optimize_hyperparams)
        
        # Split data for ensemble evaluation
        X_train, X_test, y_train, y_test = train_test_split(
            X, y, test_size=0.2, random_state=42, stratify=y
        )
        
        # Evaluate ensemble
        ensemble_results = trainer.evaluate_ensemble_performance(X_test, y_test)
        
        # Generate feature importance
        feature_importance = trainer.generate_feature_importance(training_results)
        
        # Save models
        model_saved = trainer.save_trained_models(model_path, training_results, feature_importance)
        
        # Prepare training session record
        training_session = {
            'timestamp': datetime.now().isoformat(),
            'training_samples': len(training_data),
            'feature_count': X.shape[1],
            'model_results': {name: {k: v for k, v in results.items() 
                                   if k not in ['model', 'classification_report']}
                            for name, results in training_results.items()},
            'ensemble_results': ensemble_results,
            'model_saved': model_saved,
            'model_path': model_path
        }
        
        # Save training history
        if save_history:
            history_path = model_path.replace('.pkl', '_history.json')
            trainer.save_training_history(history_path, training_session)
        
        # Prepare response
        result = {
            'success': True,
            'message': f'Successfully trained {len(training_results)} models',
            'training_results': training_results,
            'ensemble_results': ensemble_results,
            'feature_importance': feature_importance,
            'model_path': model_path,
            'training_session': training_session,
            'recommendations': trainer.generate_training_recommendations(training_results)
        }
        
        print(json.dumps(result, default=str))
        
    except Exception as e:
        error_result = {
            'success': False,
            'error': str(e),
            'message': 'Model training failed'
        }
        print(json.dumps(error_result))

    def generate_training_recommendations(self, training_results: Dict) -> List[str]:
        """Generate recommendations based on training results"""
        recommendations = []
        
        # Analyze overall performance
        test_accuracies = [r.get('test_accuracy', 0) for r in training_results.values() 
                          if 'test_accuracy' in r]
        
        if test_accuracies:
            avg_accuracy = np.mean(test_accuracies)
            
            if avg_accuracy < 0.8:
                recommendations.append("Model accuracy is below 80%. Consider collecting more training data.")
            elif avg_accuracy > 0.95:
                recommendations.append("High accuracy achieved! Monitor for overfitting on new data.")
            
            # Check for overfitting
            for name, results in training_results.items():
                if 'train_accuracy' in results and 'test_accuracy' in results:
                    train_acc = results['train_accuracy']
                    test_acc = results['test_accuracy']
                    
                    if train_acc - test_acc > 0.1:
                        recommendations.append(f"{name} shows signs of overfitting. Consider regularization.")
        
        if not recommendations:
            recommendations.append("Models trained successfully. Monitor performance on production data.")
        
        return recommendations

if __name__ == "__main__":
    main()