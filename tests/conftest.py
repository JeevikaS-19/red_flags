import sys
from pathlib import Path

# Make the project root importable (analyzer, rag, github_fetch, main).
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
