/**
 * Local chart components built on the shared ChartFrame and colours.
 *
 * Why local: in @x10/shared/charts (recharts 2.15) SimpleBarChart wraps its XAxis/YAxis in a React fragment, which
 * Recharts does not look inside, so its bars render without axes (and the horizontal layout breaks). The shared
 * scatter also has no y-axis domain option. These versions keep axes as direct children and label every bar with its
 * value, so the numbers are readable without hovering.
 */
import {
  Bar,
  BarChart,
  CartesianGrid,
  LabelList,
  ResponsiveContainer,
  Scatter,
  ScatterChart,
  Tooltip,
  XAxis,
  YAxis,
  ZAxis,
} from 'recharts';

import { ChartFrame, useChartColors, type ChartColors } from '@x10/shared/charts';

const axis = (c: ChartColors) => ({ stroke: c.muted, tick: { fill: c.muted, fontSize: 12 }, tickLine: false });
const tip = (c: ChartColors) => ({
  contentStyle: { background: c.surface, border: `1px solid ${c.grid}`, borderRadius: 8, color: c.text },
  labelStyle: { color: c.text, fontWeight: 600 },
  itemStyle: { color: c.text },
});

export function BarsChart<T extends Record<string, unknown>>({
  data,
  categoryKey,
  valueKey,
  valueLabel,
  title,
  summary,
  height = 260,
  horizontal,
  colorIndex = 0,
  format = (v) => String(v),
}: {
  data: T[];
  categoryKey: keyof T & string;
  valueKey: keyof T & string;
  valueLabel: string;
  title: string;
  summary: string;
  height?: number;
  horizontal?: boolean;
  colorIndex?: number;
  format?: (v: number) => string;
}) {
  const c = useChartColors();
  const fill = c.series[colorIndex % c.series.length];
  return (
    <ChartFrame title={title} summary={summary} height={height} empty={!data.length}>
      <ResponsiveContainer width="100%" height="100%">
        {horizontal ? (
          <BarChart data={data} layout="vertical" margin={{ left: 4, right: 36, top: 4, bottom: 4 }}>
            <CartesianGrid stroke={c.grid} strokeDasharray="3 3" horizontal={false} />
            <XAxis type="number" allowDecimals={false} {...axis(c)} />
            <YAxis type="category" dataKey={categoryKey} width={92} {...axis(c)} />
            <Tooltip cursor={{ fill: c.grid, opacity: 0.4 }} {...tip(c)} formatter={(v: number) => [format(v), valueLabel]} />
            <Bar dataKey={valueKey} name={valueLabel} fill={fill} radius={[0, 4, 4, 0]} isAnimationActive={false}>
              <LabelList dataKey={valueKey} position="right" fill={c.text} fontSize={12} formatter={(v: number) => (v === null || v === undefined ? '' : format(v))} />
            </Bar>
          </BarChart>
        ) : (
          <BarChart data={data} margin={{ left: 4, right: 12, top: 20, bottom: 4 }}>
            <CartesianGrid stroke={c.grid} strokeDasharray="3 3" vertical={false} />
            <XAxis dataKey={categoryKey} interval={0} {...axis(c)} />
            <YAxis allowDecimals={false} width={36} {...axis(c)} />
            <Tooltip cursor={{ fill: c.grid, opacity: 0.4 }} {...tip(c)} formatter={(v: number) => [format(v), valueLabel]} />
            <Bar dataKey={valueKey} name={valueLabel} fill={fill} radius={[4, 4, 0, 0]} isAnimationActive={false}>
              <LabelList dataKey={valueKey} position="top" fill={c.text} fontSize={12} formatter={(v: number) => (v === null || v === undefined ? '' : format(v))} />
            </Bar>
          </BarChart>
        )}
      </ResponsiveContainer>
    </ChartFrame>
  );
}

const EFFORT_TICKS = ['', 'S', 'M', 'L', 'XL'];

export function ValueEffortScatter<T extends { x: number; value: number; title: string; effort: string }>({
  data,
  title,
  summary,
  height = 280,
}: {
  data: T[];
  title: string;
  summary: string;
  height?: number;
}) {
  const c = useChartColors();
  return (
    <ChartFrame title={title} summary={summary} height={height} empty={!data.length}>
      <ResponsiveContainer width="100%" height="100%">
        <ScatterChart margin={{ left: 4, right: 16, top: 8, bottom: 16 }}>
          <CartesianGrid stroke={c.grid} strokeDasharray="3 3" />
          <XAxis
            type="number"
            dataKey="x"
            name="Effort"
            domain={[0.5, 4.5]}
            ticks={[1, 2, 3, 4]}
            tickFormatter={(v: number) => EFFORT_TICKS[Math.round(v)] ?? ''}
            {...axis(c)}
            label={{ value: 'Effort', position: 'insideBottom', offset: -8, fill: c.muted, fontSize: 12 }}
          />
          <YAxis
            type="number"
            dataKey="value"
            name="Value"
            domain={[0.5, 5.5]}
            ticks={[1, 2, 3, 4, 5]}
            width={44}
            {...axis(c)}
            label={{ value: 'Value', angle: -90, position: 'insideLeft', fill: c.muted, fontSize: 12 }}
          />
          <ZAxis range={[80, 80]} />
          <Tooltip
            cursor={{ strokeDasharray: '3 3' }}
            content={({ payload }) => {
              const p = payload?.[0]?.payload as T | undefined;
              if (!p) return null;
              return (
                <div style={tip(c).contentStyle} className="max-w-64 px-3 py-2 text-sm">
                  <div className="font-semibold">{p.title}</div>
                  <div>
                    Value {p.value} · effort {p.effort}
                  </div>
                </div>
              );
            }}
          />
          <Scatter data={data} fill={c.series[1]} fillOpacity={0.85} isAnimationActive={false} />
        </ScatterChart>
      </ResponsiveContainer>
    </ChartFrame>
  );
}
