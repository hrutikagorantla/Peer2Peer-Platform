# Defined at module scope so joblib can pickle/unpickle it.
from typing import List


class TaggerWrapper:
    def __init__(self, pipe, classes: List[str]):
        self.pipe = pipe
        self.classes_ = classes

    def predict_proba(self, texts):
        return self.pipe.predict_proba(texts)
