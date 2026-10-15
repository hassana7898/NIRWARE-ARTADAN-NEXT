import React from 'react';
import { View, Text, StyleSheet, type StyleProp, type ViewStyle } from 'react-native';
import Svg, { Circle, G, Line, Rect, Text as SvgText, Path, Defs, LinearGradient, Stop } from 'react-native-svg';
import { palette, radius, spacing, fontSize, chart, brand, typography } from '../../theme/tokens';

const clampPct = (n: number) => Math.min(100, Math.max(0, Number.isFinite(n) ? n : 0));

/* ==================================================================================================
 * RingGauge — the single "one number against one total" figure.
 *
 * Used where a percentage bar is not enough on its own: quota consumption, survival rate, and the
 * flock-age dial. The arc is drawn rather than composed from borders because the previous
 * percentage bars were built from plain `View` widths, which cannot render a track, a cap, or an
 * overflow state consistently across platforms.
 * ============================================================================================== */

export interface RingGaugeProps {
  /** 0..100. Values outside the range are clamped, never trusted. */
  percent: number;
  /** Outer diameter in px. Defaults to 132 — comfortable as a card's dominant figure on a 360dp phone. */
  size?: number;
  /** Arc thickness. */
  thickness?: number;
  tone?: 'primary' | 'success' | 'warning' | 'critical' | 'neutral';
  /** Large figure in the middle of the ring. Already formatted by the caller (Persian digits). */
  value?: string;
  /** Small caption under the figure, inside the ring. */
  caption?: string;
  style?: StyleProp<ViewStyle>;
}

const TONES = {
  primary: palette.primary,
  success: palette.success,
  warning: palette.warning,
  critical: palette.critical,
  neutral: palette.inkMuted,
} as const;

export function RingGauge({
  percent,
  size = 132,
  thickness = 12,
  tone = 'primary',
  value,
  caption,
  style,
}: RingGaugeProps) {
  const pct = clampPct(percent);
  const color = TONES[tone];
  const stroke = thickness;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const dash = (pct / 100) * c;

  return (
    <View style={[styles.gaugeWrap, { width: size, height: size }, style]}>
      <Svg width={size} height={size}>
        <G rotation={-90} origin={`${size / 2}, ${size / 2}`}>
          <Circle
            cx={size / 2}
            cy={size / 2}
            r={r}
            stroke={chart.track}
            strokeWidth={stroke}
            fill="none"
          />
          <Circle
            cx={size / 2}
            cy={size / 2}
            r={r}
            stroke={color}
            strokeWidth={stroke}
            strokeLinecap="round"
            strokeDasharray={`${dash} ${c - dash}`}
            fill="none"
          />
        </G>
      </Svg>

      {value != null ? (
        <View style={styles.gaugeCenter} pointerEvents="none">
          {value ? (
            <Text style={[styles.gaugeValue, { color }]} numberOfLines={1}>
              {value}
            </Text>
          ) : null}
          {caption ? (
            <Text style={styles.gaugeCaption} numberOfLines={1}>
              {caption}
            </Text>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

/* ==================================================================================================
 * MeterBar — labelled progress with an optional threshold marker.
 * ============================================================================================== */

export interface MeterBarProps {
  percent: number;
  tone?: 'primary' | 'success' | 'warning' | 'critical' | 'auto';
  height?: number;
  /** 0..100 position of a hairline marker, e.g. the "over quota" line. */
  markerAt?: number;
  style?: StyleProp<ViewStyle>;
}

/**
 * `auto` maps a percentage onto the same thresholds the business logic already uses:
 * <75 healthy, <95 approaching the cap, >=95 over. This keeps the bar honest about state instead of
 * colouring everything blue until something breaks.
 */
export function MeterBar({
  percent,
  tone = 'primary',
  height = 8,
  markerAt,
  style,
}: MeterBarProps) {
  const pct = clampPct(percent);
  const resolved =
    tone === 'auto'
      ? pct >= 100
        ? 'critical'
        : pct >= 95
        ? 'critical'
        : pct >= 75
        ? 'warning'
        : 'success'
      : tone;

  return (
    <View style={[styles.meterTrack, { height, borderRadius: height / 2 }, style]}>
      <View
        style={[
          styles.meterFill,
          {
            width: `${pct}%`,
            borderRadius: height / 2,
            backgroundColor: TONES[resolved],
          },
        ]}
      />
      {markerAt != null ? (
        <View
          style={[
            styles.meterMarker,
            { left: `${clampPct(markerAt)}%` },
          ]}
        />
      ) : null}
    </View>
  );
}

/* ==================================================================================================
 * BarSeries — the replacement for hand-rolled `width: n%` rows.
 *
 * v1 rendered feed-phase consumption as a coloured bar + three numbers and a per-phase colour picked
 * from an inline array, which meant a chart needed ~40 lines of JSX per instance. Here the data is
 * an array and the component owns the layout, so a 5-bar chart is one line at the call site.
 * ============================================================================================== */

export interface BarDatum {
  /** Persian label under the bar. */
  label: string;
  value: number;
  /** Displayed above the bar. Defaults to `value`. */
  display?: string;
  /** Overrides the categorical colour for this bar (e.g. over-quota red). */
  color?: string;
}

export interface BarSeriesProps {
  data: BarDatum[];
  height?: number;
  /** Draws value labels above each bar. Off by default — it is noisy below ~4 bars. */
  showValues?: boolean;
  tone?: string;
  style?: StyleProp<ViewStyle>;
}

export function BarSeries({
  data,
  height = 132,
  showValues = true,
  tone = chart.series[0],
  style,
}: BarSeriesProps) {
  const max = Math.max(1, ...data.map((d) => d.value));
  const labelRow = 22;

  return (
    <View style={style}>
      <Svg width="100%" height={height} viewBox={`0 0 320 ${height}`}>
        {data.map((d, i) => {
          const slot = 320 / data.length;
          const barW = Math.min(34, slot * 0.52);
          const x = i * slot + (slot - barW) / 2;
          const h = (Math.max(0, d.value) / max) * (height - labelRow - 8);
          const y = height - labelRow - h;
          const c = d.color ?? tone;

          return (
            <G key={`${d.label}-${i}`}>
              {showValues && d.display ? (
                <SvgText
                  x={x + barW / 2}
                  y={Math.max(10, y - 5)}
                  fill={palette.inkSecondary}
                  fontSize={9}
                  fontFamily={typography.medium}
                  textAnchor="middle"
                >
                  {d.display}
                </SvgText>
              ) : null}
              <Rect x={x} y={y} width={barW} height={Math.max(2, h)} rx={4} fill={c} />
              <SvgText
                x={x + barW / 2}
                y={height - 7}
                fill={chart.axisLabel}
                fontSize={9}
                fontFamily={typography.medium}
                textAnchor="middle"
              >
                {d.label}
              </SvgText>
            </G>
          );
        })}
        <Line
          x1={0}
          y1={height - labelRow}
          x2={320}
          y2={height - labelRow}
          stroke={chart.grid}
          strokeWidth={1}
        />
      </Svg>
    </View>
  );
}

/* ==================================================================================================
 * Sparkline — trend without axes.
 * ============================================================================================== */

export interface SparklineProps {
  /** Oldest → newest. */
  values: number[];
  width?: number;
  height?: number;
  tone?: string;
  /** Fills the area under the line. */
  filled?: boolean;
  style?: StyleProp<ViewStyle>;
}

export function Sparkline({
  values,
  width = 300,
  height = 64,
  tone = palette.primary,
  filled = true,
  style,
}: SparklineProps) {
  if (values.length < 2) return null;

  const max = Math.max(...values);
  const min = Math.min(...values);
  const span = max - min || 1;
  const pad = 4;
  const stepX = (width - pad * 2) / (values.length - 1);

  const pts = values.map((v, i) => ({
    x: pad + i * stepX,
    y: pad + (1 - (v - min) / span) * (height - pad * 2),
  }));

  const line = pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');
  const area = `${line} L${pts[pts.length - 1].x.toFixed(1)},${height} L${pts[0].x.toFixed(1)},${height} Z`;

  return (
    <View style={style}>
      <Svg width="100%" height={height} viewBox={`0 0 ${width} ${height}`}>
        <Defs>
          <LinearGradient id="sparkFill" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor={tone} stopOpacity={0.22} />
            <Stop offset="1" stopColor={tone} stopOpacity={0.02} />
          </LinearGradient>
        </Defs>
        {filled ? <Path d={area} fill="url(#sparkFill)" /> : null}
        <Path d={line} stroke={tone} strokeWidth={2} fill="none" strokeLinejoin="round" />
        <Circle cx={pts[pts.length - 1].x} cy={pts[pts.length - 1].y} r={3} fill={tone} />
      </Svg>
    </View>
  );
}

/* ==================================================================================================
 * StageTrack — a poultry-period timeline (day 1 → day N) with phase bands and a "today" marker.
 * ============================================================================================== */

export interface StageTrackProps {
  /** Total length of the period in days. */
  totalDays: number;
  /** Current day; may exceed `totalDays`, in which case the marker sits on the last segment. */
  currentDay: number;
  /** `[startDay, endDay]` pairs marking the feed phases. */
  phases?: Array<{ start: number; end: number; color?: string }>;
  height?: number;
}

export function StageTrack({ totalDays, currentDay, phases = [], height = 46 }: StageTrackProps) {
  const total = Math.max(1, totalDays);
  const trackTop = 6;
  const barH = 10;
  const markerX = Math.min(1, Math.max(0, currentDay / total));

  return (
    <Svg width="100%" height={height} viewBox={`0 0 320 ${height}`}>
      <Rect x={0} y={trackTop} width={320} height={barH} rx={barH / 2} fill={chart.track} />

      {phases.map((p, i) => {
        const x1 = (Math.max(0, p.start - 1) / total) * 320;
        const w = (Math.min(p.end, total) - Math.max(0, p.start - 1)) / total;
        return (
          <Rect
            key={`${p.start}-${i}`}
            x={x1}
            y={trackTop}
            width={Math.max(0, w * 320)}
            height={barH}
            rx={barH / 2}
            fill={p.color ?? chart.series[i % chart.series.length]}
          />
        );
      })}

      {/* "today" marker */}
      <Rect x={markerX * 320 - 1.5} y={trackTop - 5} width={3} height={barH + 10} rx={1.5} fill={brand.band900} />
      <SvgText
        x={Math.min(312, Math.max(8, markerX * 320))}
        y={height - 3}
        fill={palette.inkSecondary}
        fontSize={9}
        fontFamily={typography.medium}
        textAnchor="middle"
      >
        روز {currentDay}
      </SvgText>
    </Svg>
  );
}

const styles = StyleSheet.create({
  gaugeWrap: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  gaugeCenter: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
  },
  gaugeValue: {
    fontFamily: typography.bold,
    fontSize: fontSize.xxl,
    textAlign: 'center',
  },
  gaugeCaption: {
    fontFamily: typography.regular,
    fontSize: fontSize.xs,
    color: palette.inkSecondary,
    marginTop: 2,
    textAlign: 'center',
  },
  meterTrack: {
    backgroundColor: chart.track,
    overflow: 'hidden',
    width: '100%',
  },
  meterFill: {
    height: '100%',
  },
  meterMarker: {
    position: 'absolute',
    top: -2,
    bottom: -2,
    width: 2,
    marginLeft: -1,
    backgroundColor: palette.ink,
    opacity: 0.35,
  },
});

export default RingGauge;