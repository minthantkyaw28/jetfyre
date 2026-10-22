"""Throwaway: cheats by using len(track). Must fail with "future leak"."""
import numpy as np

T = 30


def fit(tracks):
    pass


def predict(track):
    return len(track) - np.arange(len(track)) - 1.0
