
import React, { useMemo } from 'react';
import {
    BarChart,
    Bar,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    Legend,
    ResponsiveContainer,
    LineChart,
    Line
} from 'recharts';

interface ChartVizProps {
    data: any[];
    columns: string[];
}

// HSL Color Generator for distinct series
const getSeriesColor = (index: number) => {
    const hue = (index * 137.508) % 360; // Golden Angle approximation
    return `hsl(${hue}, 70%, 50%)`;
};

const ChartViz: React.FC<ChartVizProps> = ({ data, columns }) => {
    if (!data || data.length === 0 || !columns) {
        return <div className="p-10 text-slate-500 text-center">No data to visualize</div>;
    }

    // 1. Analyze Columns
    const colMeta = useMemo(() => {
        const types = columns.map(() => ({ isNum: true, distinct: new Set() }));

        // Scan up to 50 rows
        const limit = Math.min(data.length, 50);
        for (let i = 0; i < limit; i++) {
            const row = data[i];
            columns.forEach((_, cIdx) => {
                const val = row[cIdx];
                if (val !== null && val !== undefined) {
                    if (typeof val !== 'number') {
                        // Check if it's a numeric string? For charts, stick to strict numbers or maybe predictable formats
                        // For simplicity: strict number
                        types[cIdx].isNum = false;
                    }
                    types[cIdx].distinct.add(String(val));
                }
            });
        }

        // Determine Roles
        const numIndices = types.map((t, i) => t.isNum ? i : -1).filter(i => i !== -1);
        const strIndices = types.map((t, i) => !t.isNum ? i : -1).filter(i => i !== -1);

        // Heuristics
        let valIdx = -1;
        let xIdx = -1;
        let seriesIdx = -1;

        // Value: First numeric column (or try to find 'amount', 'total', 'count', 'revenue')
        if (numIndices.length > 0) {
            const keywords = ['revenue', 'total', 'amount', 'count', 'sum', 'sales', 'profit'];
            const found = numIndices.find(i => keywords.some(k => columns[i].toLowerCase().includes(k)));
            valIdx = found !== undefined ? found : numIndices[0];
        }

        // X-Axis vs Series (if multiple strings)
        if (strIndices.length > 0) {
            // Time keywords
            const timeKeywords = ['date', 'time', 'year', 'month', 'day', 'quarter', 'week'];
            const timeColIdx = strIndices.find(i => timeKeywords.some(k => columns[i].toLowerCase().includes(k)));

            if (timeColIdx !== undefined) {
                xIdx = timeColIdx;
            } else {
                // High cardinality -> X-Axis
                // If only 1 string, it's X.
                if (strIndices.length === 1) {
                    xIdx = strIndices[0];
                } else {
                    // Compare cardinality
                    // const card0 = types[strIndices[0]].distinct.size;
                    // const card1 = types[strIndices[1]].distinct.size;
                    // Usually X-Axis has more items (e.g. 12 months) than Series (e.g. 3 regions)
                    // But sometimes opposite (300 products in 2 years).
                    // Prefer Date/Time if none matched.
                    // Fallback: First string is X.
                    xIdx = strIndices[0];
                }
            }

            // Series: Low cardinality string != val != x
            // Only if we have 3 dimensions (X, Y, Series)
            // Or if user specifically requested breakdown
            if (strIndices.length >= 2) {
                const foundSeries = strIndices.find(i => i !== xIdx);
                seriesIdx = foundSeries !== undefined ? foundSeries : -1;
            }
        }

        return { valIdx, xIdx, seriesIdx, types };
    }, [data, columns]);


    // 2. Transform Data
    const { chartData, seriesKeys, xKey } = useMemo(() => {
        const { valIdx, xIdx, seriesIdx } = colMeta;

        if (valIdx === -1 || xIdx === -1) return { chartData: [], seriesKeys: [], xKey: '' };

        const xCol = columns[xIdx];
        const valCol = columns[valIdx]; // Default Y key if no pivot

        // PIVOT MODE: If we have a series column
        if (seriesIdx !== -1 && seriesIdx !== undefined) {
            const map = new Map<string, any>();
            const seriesSet = new Set<string>();

            data.forEach(row => {
                const xVal = row[xIdx];
                const sVal = row[seriesIdx]; // e.g. "Electronics"
                const yVal = row[valIdx];

                const key = String(xVal);
                if (!map.has(key)) {
                    map.set(key, { [xCol]: xVal }); // Init with X value
                }
                const entry = map.get(key);

                // Clean series name (handle nulls)
                const sName = sVal === null ? 'Unknown' : String(sVal);
                entry[sName] = yVal;
                seriesSet.add(sName);
            });

            return {
                chartData: Array.from(map.values()),
                seriesKeys: Array.from(seriesSet),
                xKey: xCol
            };
        }

        // STANDARD MODE: Simple X/Y
        const simpleData = data.map(row => ({
            [xCol]: row[xIdx],
            [valCol]: row[valIdx]
        }));

        return {
            chartData: simpleData,
            seriesKeys: [valCol], // Just one series
            xKey: xCol
        };

    }, [data, columns, colMeta]);


    if (chartData.length === 0) {
        return <div className="flex items-center justify-center h-64 text-slate-500">Unable to chart data</div>;
    }

    return (
        <div className="w-full h-full min-h-[300px] bg-slate-900/50 p-4 rounded-lg border border-slate-700 flex flex-col">
            <ResponsiveContainer width="100%" height="100%" minHeight={300}>
                <BarChart data={chartData} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#334155" opacity={0.5} />
                    <XAxis
                        dataKey={xKey}
                        stroke="#94a3b8"
                        fontSize={12}
                        tickLine={false}
                        axisLine={{ stroke: '#475569' }}
                    />
                    <YAxis
                        stroke="#94a3b8"
                        fontSize={12}
                        tickLine={false}
                        axisLine={{ stroke: '#475569' }}
                        tickFormatter={(val) => typeof val === 'number' ?
                            new Intl.NumberFormat('en-US', { notation: "compact", compactDisplay: "short" }).format(val)
                            : val}
                    />
                    <Tooltip
                        contentStyle={{ backgroundColor: '#1e293b', borderColor: '#475569', color: '#f8fafc', borderRadius: '6px' }}
                        itemStyle={{ color: '#e2e8f0' }}
                        formatter={(value: any) => typeof value === 'number' ? value.toLocaleString() : value}
                        cursor={{ fill: '#334155', opacity: 0.2 }}
                    />
                    <Legend wrapperStyle={{ paddingTop: '10px' }} />

                    {seriesKeys.map((key, idx) => (
                        <Bar
                            key={key}
                            dataKey={key}
                            fill={getSeriesColor(idx)}
                            radius={[4, 4, 0, 0]}
                            maxBarSize={60}
                            animationDuration={1000}
                        />
                    ))}
                </BarChart>
            </ResponsiveContainer>
        </div>
    );
};

export default ChartViz;
