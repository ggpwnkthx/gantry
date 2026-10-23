/**
 * The metrics of a service, in the text format of Prometheus.
 *
 * The console reads the metrics of the services it watches from the
 * services themselves: the replicas it probes are the replicas whose
 * metrics it reads, and a deployment that has no Prometheus is a
 * deployment whose console still works. The parser is small on purpose:
 * the text format of Prometheus is a line per sample, and the console
 * needs a handful of counters and gauges.
 */

/** A sample of a metric. */
export interface Sample {
  /** The name of the metric. */
  name: string
  /** The labels of the sample. */
  labels: Record<string, string>
  /** The value of the sample. */
  value: number
}

/** The metrics of a service. */
export interface Metrics {
  /** Every sample of the metrics, by the name of the metric. */
  samples: Map<string, Sample[]>
}

/** The line of a sample of the text format. */
const SAMPLE_PATTERN = /^([a-zA-Z_:][a-zA-Z0-9_:]*)(\{[^}]*\})?\s+(.+)$/

/** The label of a sample, in the braces of its name. */
const LABEL_PATTERN = /([a-zA-Z_][a-zA-Z0-9_]*)="((?:[^"\\]|\\.)*)"/g

/** Reads the labels of a sample. */
function parseLabels(text: string | undefined): Record<string, string> {
  const labels: Record<string, string> = {}
  if (!text) return labels
  LABEL_PATTERN.lastIndex = 0
  let match = LABEL_PATTERN.exec(text)
  while (match !== null) {
    const name = match[1]
    const value = match[2]
    if (name !== undefined && value !== undefined) {
      labels[name] = value.replace(/\\"/g, '"').replace(/\\n/g, '\n').replace(/\\\\/g, '\\')
    }
    match = LABEL_PATTERN.exec(text)
  }
  return labels
}

/**
 * Parses the text format of Prometheus.
 *
 * The lines that are not samples — the comments and the empty lines — are
 * skipped, and a line that is not understood is skipped as well: a metric
 * of a version of a service that Gantry does not know is not a reason to
 * fail the whole page.
 */
export function parseMetrics(text: string): Metrics {
  const samples = new Map<string, Sample[]>()
  for (const line of text.split('\n')) {
    const trimmed = line.trim()
    if (trimmed.length === 0 || trimmed.startsWith('#')) continue
    const match = SAMPLE_PATTERN.exec(trimmed)
    if (!match) continue
    const name = match[1]
    const raw = match[3]
    if (!name || raw === undefined) continue
    const value = Number.parseFloat(raw.split(/\s+/)[0] ?? '')
    if (!Number.isFinite(value)) continue
    const sample: Sample = { name, labels: parseLabels(match[2]), value }
    const list = samples.get(name)
    if (list) {
      list.push(sample)
    } else {
      samples.set(name, [sample])
    }
  }
  return { samples }
}

/** The sum of the values of a metric. */
export function sumOf(metrics: Metrics, name: string): number {
  const samples = metrics.samples.get(name)
  if (!samples) return 0
  return samples.reduce((total, sample) => total + sample.value, 0)
}

/** The value of a gauge, or zero when the metric is not there. */
export function gaugeValue(metrics: Metrics, name: string): number {
  const samples = metrics.samples.get(name)
  const sample = samples?.[0]
  return sample?.value ?? 0
}

/** The sum of the values of a metric, for the samples that carry a label. */
export function sumByLabel(metrics: Metrics, name: string, label: string, value: string): number {
  const samples = metrics.samples.get(name)
  if (!samples) return 0
  return samples
    .filter((sample) => sample.labels[label] === value)
    .reduce((total, sample) => total + sample.value, 0)
}

/** The breakdown of a metric by the value of a label. */
export function breakdownByLabel(
  metrics: Metrics,
  name: string,
  label: string
): Record<string, number> {
  const breakdown: Record<string, number> = {}
  for (const sample of metrics.samples.get(name) ?? []) {
    const key = sample.labels[label] ?? ''
    breakdown[key] = (breakdown[key] ?? 0) + sample.value
  }
  return breakdown
}

/**
 * A quantile of a histogram, from its buckets.
 *
 * The buckets are cumulative, and the quantile is the bucket that holds it:
 * it is an approximation, and it is the approximation every dashboard of
 * Prometheus makes with the same buckets.
 */
export function quantileOf(metrics: Metrics, name: string, quantile: number): number | undefined {
  const samples = metrics.samples.get(`${name}_bucket`)
  if (!samples || samples.length === 0) return undefined
  const sorted = [...samples].sort((left, right) => {
    const leftBound = Number.parseFloat(left.labels.le ?? '0')
    const rightBound = Number.parseFloat(right.labels.le ?? '0')
    return leftBound - rightBound
  })
  const total = sorted.reduce((sum, sample) => sum + sample.value, 0)
  if (total <= 0) return undefined
  const wanted = total * quantile
  let cumulative = 0
  for (const sample of sorted) {
    cumulative += sample.value
    if (cumulative >= wanted) {
      const bound = Number.parseFloat(sample.labels.le ?? '0')
      return Number.isFinite(bound) ? bound : undefined
    }
  }
  const last = sorted[sorted.length - 1]
  const bound = Number.parseFloat(last?.labels.le ?? '0')
  return Number.isFinite(bound) ? bound : undefined
}
