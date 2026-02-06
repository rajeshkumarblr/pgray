
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
    // auto-detect numeric columns for Y axis and string for X axis
    const { xAxisKey, seriesKeys } = useMemo(() => {
        if (!data || data.length === 0) return { xAxisKey: '', seriesKeys: [] };

        // Simple heuristic: 
        // 1. First string-like column (or date) is X Axis. 
        // 2. All numeric columns are Series.

        // Sample first row
        const firstRow = data[0];
        // Since rows are arrays in your system (based on main.py), we need to map them if they are coming as arrays. 
        // Wait, executeQuery returns { columns: [], rows: [] } where rows are arrays of values.
        // Recharts needs Objects. We need to transform data first.
        return { xAxisKey: '', seriesKeys: [] }; // Placeholder, logic below handles transformation
    }, [data]);

    // Transform Data: Array[] -> Object[]
    const chartData = useMemo(() => {
        if (!data || !columns) return [];
        return data.map((row) => {
            const obj: any = {};
            columns.forEach((col, idx) => {
                obj[col] = row[idx];
            });
            return obj;
        });
    }, [data, columns]);

    // Detect Keys from Object Data
    const { xKey, yKeys } = useMemo(() => {
        if (chartData.length === 0) return { xKey: 'id', yKeys: [] };
        const first = chartData[0];
        const keys = Object.keys(first);

        // Heuristic: First string key is X
        let x = keys.find(k => typeof first[k] === 'string');
        if (!x) x = keys[0]; // fallback

        // Heuristic: All number keys are Y (excluding x)
        const y = keys.filter(k => typeof first[k] === 'number' && k !== x);

        return { xKey: x, yKeys: y };
    }, [chartData]);

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
        </div>
    );
};

export default ChartViz;
