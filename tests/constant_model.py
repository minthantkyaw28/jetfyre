"""Throwaway: predicts a constant life. Must pass evaluate.py."""
import numpy as np

T = 30


def fit(tracks):
    pass


def predict(track):
    return np.full(len(track), 100.0)
