# Azure DocumentDB Performance Lab User Guide

This guide explains how to run ingestion and query benchmarks in the lab and how to read the results correctly.

## 1. Goal of the lab

Use the lab to answer four questions:

1. How fast does Azure DocumentDB respond for a given workload?
2. How stable is performance over time?
3. Which resource becomes the bottleneck (CPU, memory, or IOPS)?
4. Does Redis improve query latency and throughput for this access pattern?

## 2. What is measured

The UI combines two data sources.

### Workload metrics (from benchmark runner)

1. Request latency
2. Throughput
3. Success count
4. Failure count
5. Percentiles (P50, P90, P95, P99)

### Cluster metrics (from Azure Monitor)

1. CPU utilization
2. Memory utilization
3. IOPS utilization

Note: cluster charts represent Azure DocumentDB resource behavior, not the client machine.

## 3. End-to-end workflow

### Step 1: Log in

Sign in with credentials provided by the administrator.

### Step 2: Upload dataset

In Upload Dataset:

1. Select one or more JSON files.
2. Upload and wait for upload ID.
3. Confirm schema/status appears.

Use representative datasets. Very small synthetic data can produce misleading conclusions.

### Step 3: Run ingestion benchmark

In Ingestion Test, set:

1. Test name
2. Upload ID
3. Collection name
4. Operation type
5. Input load (TPS)
6. Duration (seconds)
7. Azure DocumentDB tier
8. Cleanup option

Start the run and monitor live metrics.

### Step 4: Run query benchmark

In Query + Redis Test:

1. Select query template or custom filter.
2. Optionally set projection/sort/limit.
3. Toggle Redis on or off.
4. Pick Azure Managed Redis SKU when needed.

Start the run and compare results with and without Redis for the same query shape.

### Step 5: Watch live results

Track workload charts and cluster charts together. A single chart is not enough to identify root cause.

## 4. How to read each chart

### Ingestion per-second average latency

- Lower and flatter is better.
- Spikes may indicate throttling, hot partitions, serialization overhead, or transient network effects.

Healthy signal:

- Stable latency at target TPS.

Risk signal:

- Upward drift in latency during the run.

### Ingestion per-second throughput

- Throughput should stay near requested TPS.
- If throughput drops while latency rises, the run is likely saturating a resource.

### Query per-second average latency

- Good for comparing query shapes and Redis impact.
- Never rely on average alone; validate with P95/P99.

### Query per-second throughput

- Stable, high throughput indicates sustainable query performance.
- If Redis significantly improves throughput, workload is likely cache-friendly.

### CPU utilization trend

- Sustained high CPU with rising latency usually indicates compute bottleneck.
- Low CPU with high latency suggests another bottleneck (query design, IOPS, or client path).

### Memory utilization trend

- Stable memory is generally healthy.
- Prolonged high memory under query load may indicate large working set or expensive query execution.

### IOPS trend

- Interpret with latency and throughput.
- High IOPS with poor throughput can indicate inefficient access patterns.

## 5. Tables that matter most

### Run Summary

Use for:

1. Completion status
2. Total request volume
3. Aggregate throughput
4. Failure count

### Overall Percentiles (P50/P90/P95/P99)

This is the most important latency table.

Interpretation:

1. Good P50 but poor P99 means tail-latency issue.
2. Large P50-to-P99 gap indicates unstable experience.
3. Production readiness depends heavily on acceptable P95/P99.

Example:

1. P50 = 12 ms
2. P90 = 25 ms
3. P99 = 300 ms

Meaning: most requests are fast, but a small percentage are very slow.

### Recent per-second percentiles

Use to detect:

1. Warm-up effects
2. Periodic spikes
3. Short throttling windows
4. Latency drift over time

### Resource utilization summary table

Use to correlate latest CPU/memory/IOPS with latency behavior. Do not interpret in isolation.

## 6. Recommended interpretation sequence

For every run:

1. Confirm run completion.
2. Check failures and aggregate throughput in Run Summary.
3. Inspect average latency trends.
4. Inspect P95 and P99.
5. Review recent per-second percentiles for spikes.
6. Correlate with CPU/memory/IOPS trends.
7. Compare Redis on/off for identical query shape.
8. Compare tiers only when all other inputs are unchanged.

## 7. Correct run-to-run comparison

Only compare runs when these are the same:

1. Dataset
2. Collection data state
3. Operation type
4. Query shape
5. Duration
6. Target TPS
7. Cleanup strategy

Change only one variable per experiment.

## 8. Common patterns and what they mean

### Pattern A: High throughput, low average latency, low P99

Interpretation: workload is healthy and stable for tested load.

### Pattern B: Good average latency, poor P99

Interpretation: tail-latency issue.

Typical causes:

1. Hot partitions
2. Bursty traffic
3. Broad scans
4. Cache misses

### Pattern C: Rising latency with flat or falling throughput

Interpretation: bottleneck reached.

Typical causes:

1. CPU saturation
2. IOPS pressure
3. Inefficient queries
4. Over-aggressive TPS target

### Pattern D: High CPU and high query latency

Interpretation: likely compute-bound query path.

Actions:

1. Improve index design
2. Increase query selectivity
3. Return fewer fields
4. Validate a higher tier

### Pattern E: High IOPS with poor ingestion latency

Interpretation: write path may be storage/index heavy.

Actions:

1. Review indexing policy
2. Remove unnecessary indexed fields
3. Optimize document shape and write behavior

### Pattern F: Redis gives strong query gains

Interpretation: access pattern is cache-friendly.

Actions:

1. Keep Redis for that path
2. Tune key strategy and TTL
3. Evaluate cost/performance tradeoff

## 9. Troubleshooting missing charts

If CPU, memory, IOPS, or percentile views are empty:

1. Confirm benchmark run completed.
2. Verify Azure Monitor access permissions.
3. Verify correct Azure DocumentDB resource ID.
4. Verify metric availability for selected time window.
5. Ensure test duration was long enough.
6. Confirm backend telemetry pipeline returned data.

If workload charts are present but cluster charts are empty, benchmark ran but telemetry collection likely failed.

## 10. Best practices checklist

### Reliable testing

1. Use realistic datasets.
2. Warm up before comparisons.
3. Repeat runs and compare trends.
4. Keep network conditions stable.
5. Change one variable at a time.
6. Prioritize P95/P99 over averages.

### Ingestion optimization

1. Remove unnecessary indexes.
2. Use balanced shard/partition key strategy.
3. Keep write payloads compact.
4. Reduce write amplification.
5. Reuse client connections.
6. Run close to target region.

### Query optimization

1. Build indexes for actual query patterns.
2. Avoid broad scans.
3. Limit returned fields.
4. Use Redis for repeat read patterns.
5. Compare exact, filtered, and aggregate query classes separately.

## 11. Suggested run report template

Capture the following for each run:

1. Test name
2. Date/time
3. Dataset
4. Operation type
5. Target TPS
6. Duration
7. Cluster tier
8. Redis enabled/disabled
9. P50/P90/P95/P99
10. Average throughput
11. Failure count
12. Peak CPU/memory/IOPS
13. Conclusion and next action

## Final reminder

A larger tier is not automatically better. The best outcome is the right combination of workload shape, indexing, caching, and cluster size for your latency and throughput goals.
