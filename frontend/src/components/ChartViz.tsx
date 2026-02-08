
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

const ChartViz: React.FC<ChartVizProps> = ({ data, columns }) => {

    // Pivot Logic for Long Data (3 columns: 2 Strings, 1 Number)
    const pivoted = useMemo(() => {
        if (!data || data.length === 0 || !columns || columns.length !== 3) return null;

        // Check types of first row
        const row0 = data[0];
        // row0 is array [val, val, val]
        const types = row0.map((v: any) => typeof v);
        const numIndices = types.map((t: string, i: number) => t === 'number' ? i : -1).filter((i: number) => i !== -1);
        const strIndices = types.map((t: string, i: number) => (t === 'string' || t === 'object') ? i : -1).filter((i: number) => i !== -1); // Date might be object?

        // Expect 1 Number (Value) and 2 Strings (Cat + Time)
        if (numIndices.length !== 1 || strIndices.length !== 2) return null;

        const valIdx = numIndices[0];
        const strIdx1 = strIndices[0];
        const strIdx2 = strIndices[1];

        // Identify X-Axis (Time) vs Series (Category)
        // Heuristic: Column Name contains 'date', 'time', 'year', 'month' -> X-Axis
        const name1 = columns[strIdx1].toLowerCase();
        const name2 = columns[strIdx2].toLowerCase();

        const timeKeywords = ['date', 'time', 'year', 'month', 'day', 'week', 'quarter', 'hour'];
        const isTime1 = timeKeywords.some(k => name1.includes(k));
        const isTime2 = timeKeywords.some(k => name2.includes(k));

        let xIdx = -1;
        if (isTime1 && !isTime2) xIdx = strIdx1;
        else if (!isTime1 && isTime2) xIdx = strIdx2;
        else {
            // Fallback: Check cardinality. Time usually has MORE points than Categories (e.g. 12 months vs 3 products)
            // But sometimes less.
            // Let's assume the one with HIGHER cardinality is X. 
            // (Wait, bar chart x-axis usually has distinct buckets. Series is usually fewer.)
            const set1 = new Set(data.map((r: any[]) => r[strIdx1])).size;
            const set2 = new Set(data.map((r: any[]) => r[strIdx2])).size;
            xIdx = (set1 > set2) ? strIdx1 : strIdx2;
        }

        const catIdx = (xIdx === strIdx1) ? strIdx2 : strIdx1;
        const xCol = columns[xIdx];

        // Perform Pivot
        const map = new Map<string, any>();
        const series = new Set<string>();

        data.forEach((row: any[]) => {
            const xVal = row[xIdx];
            const cat = row[catIdx];
            const val = row[valIdx];

            const key = String(xVal);
            if (!map.has(key)) {
                map.set(key, { [xCol]: xVal });
            }
            const entry = map.get(key);
            entry[cat] = val;
            series.add(String(cat));
        });

        return {
            data: Array.from(map.values()),
            xKey: xCol,
            yKeys: Array.from(series)
        };
    }, [data, columns]);

    // Standard Transformation (Array -> Object)
    const standardData = useMemo(() => {
        if (!data || !columns) return [];
        return data.map((row) => {
            const obj: any = {};
            columns.forEach((col, idx) => {
                obj[col] = row[idx];
            });
            return obj;
        });
    }, [data, columns]);

    // Determine final props
    const { chartData, xKey, yKeys, isPivoted } = useMemo(() => {
        if (pivoted) {
            return { chartData: pivoted.data, xKey: pivoted.xKey, yKeys: pivoted.yKeys, isPivoted: true };
        }

        // Standard detection
        if (standardData.length === 0) return { chartData: [], xKey: '', yKeys: [], isPivoted: false };

        const first = standardData[0];
        const keys = Object.keys(first);

        let x = keys.find(k => typeof first[k] === 'string');
        // If query is "SELECT count, type ...", x might be second? 
        // Heuristic: if first is number and second is string, maybe swap?
        // But usually X is first in GROUP BY.
        if (!x) x = keys[0];

        const y = keys.filter(k => typeof first[k] === 'number' && k !== x);

        return { chartData: standardData, xKey: x, yKeys: y, isPivoted: false };
    }, [pivoted, standardData]);

    if (!chartData || chartData.length === 0) {
        return <div className="p-10 text-slate-400">No data to visualize</div>;
    }

    if (yKeys.length === 0) {
        return <div className="p-10 text-slate-400">No numeric data found to chart.</div>;
    }

    return (
        <div className="w-full h-full min-h-[400px] bg-slate-900/50 p-4 rounded-lg border border-slate-700">
            <ResponsiveContainer width="100%" height={400}>
                <BarChart
                    data={chartData}
                    margin={{
                        top: 20,
                        right: 30,
                        left: 20,
                        bottom: 5,
                    }}
                >
                    <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                    <XAxis dataKey={xKey} stroke="#94a3b8" />
                    <YAxis stroke="#94a3b8" />
                    <Tooltip
                        contentStyle={{ backgroundColor: '#1e293b', borderColor: '#475569', color: '#f8fafc' }}
                    />
                    <Legend />
                    {yKeys.map((key, index) => (
                        <Bar key={key} dataKey={key} fill={`hsl(${index * 60 + 200}, 70%, 50%)`} />
                    ))}
                </BarChart>
            </ResponsiveContainer>
            {isPivoted && (
                <div className="text-right text-xs text-slate-500 mt-2 italic">
                    * Auto-pivoted by Category
                </div>
            )}
        </div>
    );
};

export default ChartViz;
