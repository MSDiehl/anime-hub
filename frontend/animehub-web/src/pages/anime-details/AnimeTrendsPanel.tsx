import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

export type AnimeTrendPoint = {
  t: string;
  score: number | null;
  pop: number | null;
};

type Props = {
  data: AnimeTrendPoint[];
};

export default function AnimeTrendsPanel({ data }: Props) {
  return (
    <section className="adPanel mangaPanel">
      <div className="adPanelTag" aria-hidden="true">
        Trends
      </div>

      <TrendChart title="Score by related anime" data={data} dataKey="score" />
      <TrendChart title="Popularity by related anime" data={data} dataKey="pop" />
    </section>
  );
}

function TrendChart({
  title,
  data,
  dataKey,
}: {
  title: string;
  data: AnimeTrendPoint[];
  dataKey: "score" | "pop";
}) {
  return (
    <div className="adChartBlock">
      <div className="adChartLabel">{title}</div>
      <div className="adChartWrap">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data}>
            <CartesianGrid strokeDasharray="3 3" opacity={0.15} />
            <XAxis dataKey="t" />
            <YAxis />
            <Tooltip />
            <Line type="monotone" dataKey={dataKey} dot={false} strokeWidth={2} />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
