import React, { useMemo } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Svg, { Polyline, Circle, Line, Text as SvgText } from 'react-native-svg';
import { colors } from '@breeyo/ui';

interface WeightDataPoint {
  date: Date;
  weightKg: number;
}

interface WeightTrendChartProps {
  data: WeightDataPoint[];
  isLoading?: boolean;
}

const CHART_WIDTH = 300;
const CHART_HEIGHT = 200;
const PADDING = { top: 20, right: 20, bottom: 30, left: 40 };
const PLOT_WIDTH = CHART_WIDTH - PADDING.left - PADDING.right;
const PLOT_HEIGHT = CHART_HEIGHT - PADDING.top - PADDING.bottom;

function formatDateShort(date: Date): string {
  const d = new Date(date);
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${months[d.getMonth()]} '${String(d.getFullYear()).slice(2)}`;
}

export function WeightTrendChart({ data, isLoading }: WeightTrendChartProps) {
  const sortedData = useMemo(
    () =>
      [...data].sort(
        (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime(),
      ),
    [data],
  );

  if (isLoading) {
    return (
      <View style={styles.container}>
        <Text style={styles.title}>Weight Trend</Text>
        <View style={styles.chartPlaceholder}>
          <View style={styles.skeletonChart} />
        </View>
      </View>
    );
  }

  if (data.length === 0) {
    return (
      <View style={styles.container}>
        <Text style={styles.title}>Weight Trend</Text>
        <View style={styles.emptyContainer}>
          <Text style={styles.emptyText}>No weight data recorded.</Text>
        </View>
      </View>
    );
  }

  if (sortedData.length < 3) {
    return (
      <View style={styles.container}>
        <Text style={styles.title}>Weight Trend</Text>
        <View style={styles.emptyContainer}>
          <Text style={styles.insufficientText}>
            Not enough data for weight trend. Needs 3+ consultations with weight
            recorded.
          </Text>
          <View style={styles.dataPointsRow}>
            {sortedData.map((point, index) => (
              <View key={index} style={styles.dataPointChip}>
                <Text style={styles.dataPointDate}>
                  {formatDateShort(point.date)}
                </Text>
                <Text style={styles.dataPointWeight}>
                  {point.weightKg.toFixed(1)} kg
                </Text>
              </View>
            ))}
          </View>
        </View>
      </View>
    );
  }

  // Calculate ranges for scaling
  const weights = sortedData.map((d) => d.weightKg);
  const minWeight = Math.floor(Math.min(...weights) * 0.9);
  const maxWeight = Math.ceil(Math.max(...weights) * 1.1);
  const weightRange = maxWeight - minWeight || 1;

  const dates = sortedData.map((d) => new Date(d.date).getTime());
  const minDate = Math.min(...dates);
  const maxDate = Math.max(...dates);
  const dateRange = maxDate - minDate || 1;

  // Scale points to chart coordinates
  const points = sortedData.map((d) => {
    const x =
      PADDING.left +
      ((new Date(d.date).getTime() - minDate) / dateRange) * PLOT_WIDTH;
    const y =
      PADDING.top +
      PLOT_HEIGHT -
      ((d.weightKg - minWeight) / weightRange) * PLOT_HEIGHT;
    return { x, y, weight: d.weightKg, date: d.date };
  });

  const polylinePoints = points.map((p) => `${p.x},${p.y}`).join(' ');

  // Y-axis labels (3-4 ticks)
  const yTickCount = 4;
  const yTicks = Array.from({ length: yTickCount }, (_, i) => {
    const value = minWeight + (weightRange * i) / (yTickCount - 1);
    const y =
      PADDING.top +
      PLOT_HEIGHT -
      ((value - minWeight) / weightRange) * PLOT_HEIGHT;
    return { value, y };
  });

  // X-axis labels (first, middle, last)
  const xLabels = [
    { date: sortedData[0]!.date, x: points[0]!.x },
    {
      date: sortedData[Math.floor(sortedData.length / 2)]!.date,
      x: points[Math.floor(points.length / 2)]!.x,
    },
    {
      date: sortedData[sortedData.length - 1]!.date,
      x: points[points.length - 1]!.x,
    },
  ];

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Weight Trend</Text>
      <View style={styles.chartContainer}>
        <Svg width={CHART_WIDTH} height={CHART_HEIGHT}>
          {/* Grid lines */}
          {yTicks.map((tick, i) => (
            <Line
              key={`grid-${i}`}
              x1={PADDING.left}
              y1={tick.y}
              x2={CHART_WIDTH - PADDING.right}
              y2={tick.y}
              stroke="#E7E0EC"
              strokeWidth={1}
              strokeDasharray="4,4"
            />
          ))}

          {/* Y-axis labels */}
          {yTicks.map((tick, i) => (
            <SvgText
              key={`y-label-${i}`}
              x={PADDING.left - 6}
              y={tick.y + 4}
              fontSize={10}
              fill="#79747E"
              textAnchor="end"
            >
              {tick.value.toFixed(1)}
            </SvgText>
          ))}

          {/* X-axis labels */}
          {xLabels.map((label, i) => (
            <SvgText
              key={`x-label-${i}`}
              x={label.x}
              y={CHART_HEIGHT - 8}
              fontSize={9}
              fill="#79747E"
              textAnchor="middle"
            >
              {formatDateShort(label.date)}
            </SvgText>
          ))}

          {/* Line */}
          <Polyline
            points={polylinePoints}
            fill="none"
            stroke={colors.primary}
            strokeWidth={2}
            strokeLinejoin="round"
            strokeLinecap="round"
          />

          {/* Data points */}
          {points.map((p, i) => (
            <Circle
              key={`point-${i}`}
              cx={p.x}
              cy={p.y}
              r={4}
              fill="#FFFBF5"
              stroke={colors.primary}
              strokeWidth={2}
            />
          ))}
        </Svg>

        {/* Current weight callout */}
        <View style={styles.currentWeight}>
          <Text style={styles.currentWeightLabel}>Current</Text>
          <Text style={styles.currentWeightValue}>
            {sortedData[sortedData.length - 1]!.weightKg.toFixed(1)} kg
          </Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#FFFBF5',
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: '#E7E0EC',
    marginHorizontal: 16,
    marginVertical: 8,
  },
  title: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1C1B1F',
    marginBottom: 12,
  },
  chartContainer: {
    alignItems: 'center',
  },
  chartPlaceholder: {
    height: 200,
    justifyContent: 'center',
    alignItems: 'center',
  },
  skeletonChart: {
    width: CHART_WIDTH,
    height: CHART_HEIGHT,
    backgroundColor: '#F5F0EB',
    borderRadius: 8,
  },
  emptyContainer: {
    height: 120,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 16,
  },
  emptyText: {
    fontSize: 14,
    color: '#79747E',
    textAlign: 'center',
  },
  insufficientText: {
    fontSize: 14,
    color: '#79747E',
    textAlign: 'center',
    marginBottom: 12,
  },
  dataPointsRow: {
    flexDirection: 'row',
    gap: 8,
    flexWrap: 'wrap',
    justifyContent: 'center',
  },
  dataPointChip: {
    backgroundColor: '#E8F5E9',
    borderRadius: 16,
    paddingHorizontal: 12,
    paddingVertical: 6,
    alignItems: 'center',
  },
  dataPointDate: {
    fontSize: 10,
    color: '#49454F',
  },
  dataPointWeight: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.primary,
  },
  currentWeight: {
    position: 'absolute',
    top: 0,
    right: 0,
    alignItems: 'flex-end',
  },
  currentWeightLabel: {
    fontSize: 10,
    color: '#79747E',
  },
  currentWeightValue: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.primary,
  },
});
