"use client";

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  ResponsiveContainer,
  Cell,
  Tooltip,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CHART_COLORS, CHART_TOOLTIP_STYLE } from "@/lib/chart-colors";
import type { RatingDistribution } from "@/lib/types/stats";

interface RatingDistributionChartProps {
  data: RatingDistribution[];
}

const STAR_LABELS: Record<number, string> = {
  1: "1 ★",
  2: "2 ★",
  3: "3 ★",
  4: "4 ★",
  5: "5 ★",
};

export function RatingDistributionChart({ data }: RatingDistributionChartProps) {
  const sorted = [...data].sort((a, b) => a.stars - b.stars);

  const chartData = sorted.map((entry) => ({
    name: STAR_LABELS[entry.stars] ?? `${entry.stars} ★`,
    count: entry.count,
    stars: entry.stars,
  }));

  if (chartData.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Distribuição de avaliações</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground text-center py-8">
            Nenhuma avaliação ainda.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Distribuição de avaliações</CardTitle>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={200}>
          <BarChart
            layout="vertical"
            data={chartData}
            margin={{ top: 0, right: 16, bottom: 0, left: 8 }}
          >
            <XAxis
              type="number"
              allowDecimals={false}
              tick={{ fontSize: 11 }}
              tickLine={false}
              axisLine={false}
            />
            <YAxis
              type="category"
              dataKey="name"
              width={40}
              tick={{ fontSize: 12 }}
              tickLine={false}
              axisLine={false}
            />
            <Tooltip
              cursor={{ fill: "var(--muted)", opacity: 0.4 }}
              contentStyle={CHART_TOOLTIP_STYLE}
            />
            <Bar dataKey="count" radius={[0, 4, 4, 0]} maxBarSize={28}>
              {chartData.map((entry) => (
                <Cell
                  key={`cell-${entry.stars}`}
                  fill={CHART_COLORS[(entry.stars - 1) % CHART_COLORS.length]}
                />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}
