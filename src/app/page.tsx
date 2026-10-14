import CandleChart from "@/components/CandleChart";
import ExperimentPanel from "@/components/ExperimentPanel";

export default function Home() {
  return (
    <main>
      <h1>EV over Trade Sessions</h1>
      <CandleChart />
      <ExperimentPanel />
    </main>
  );
}
