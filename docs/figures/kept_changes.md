| Turn | Change | Mean cost |
|---|---|---|
| 1 | baseline | 32.59 |
| 2 | lower T from 30 to 25: baseline has 0 failures so it pulls too early | 27.68 |
| 4 | add 10-cycle backward rolling means of all sensors to cut sensor noise (retry: turn 3 edit did not apply) | 23.39 |
| 7 | lower T from 25 to 15: still 0 failures and ~23 wasted cycles per engine with the rolling-mean model | 14.38 |
| 8 | lower T from 15 to 10 to keep trading early-pull waste for rare failures | 9.41 |
| 10 | weight training rows with life left < 30 five times to sharpen predictions where pulls happen | 9.13 |
| 17 | conservative policy: quantile 0.35 loss so uncertain engines read low, with T 10->7 to keep typical pull point | 6.92 |

Turn 3 was a no-op re-test: its edit did not apply, so it re-ran the turn 2 model. It is not counted as an experiment.
