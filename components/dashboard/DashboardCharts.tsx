"use client";

import {
  ArcElement,
  CategoryScale,
  Chart,
  DoughnutController,
  Filler,
  Legend,
  LineController,
  LineElement,
  LinearScale,
  PieController,
  PointElement,
  Tooltip,
} from "chart.js";
import { useEffect, useRef } from "react";

Chart.register(
  ArcElement,
  CategoryScale,
  Filler,
  Legend,
  DoughnutController,
  LineController,
  LineElement,
  LinearScale,
  PieController,
  PointElement,
  Tooltip,
);
Chart.defaults.font.family = "'Hanken Grotesk', sans-serif";
Chart.defaults.font.size = 12;
Chart.defaults.color = "#7A746A";

const colors = ["#6D5BD0", "#C0851A", "#109C6B", "#2C7BE0", "#DD4F88"];

export function WeeklySalesChart({
  labels,
  sales,
  purchases,
}: {
  labels: string[];
  sales: number[];
  purchases: number[];
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (!canvasRef.current) return;

    const chart = new Chart(canvasRef.current, {
      type: "line",
      data: {
        labels,
        datasets: [
          {
            label: "Sales",
            data: sales,
            borderColor: "#C0851A",
            backgroundColor: "rgba(192,133,26,.12)",
            tension: 0.35,
            fill: true,
            pointRadius: 3,
            pointBackgroundColor: "#C0851A",
            borderWidth: 2,
          },
          {
            label: "Purchases",
            data: purchases,
            borderColor: "#109C6B",
            backgroundColor: "rgba(16,156,107,.10)",
            tension: 0.35,
            fill: true,
            pointRadius: 3,
            pointBackgroundColor: "#109C6B",
            borderWidth: 2,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            position: "top",
            align: "center",
            labels: { usePointStyle: true, pointStyle: "rectRounded", boxWidth: 14, padding: 18 },
          },
        },
        scales: {
          y: {
            beginAtZero: true,
            ticks: { callback: (value) => `$ ${value}` },
            title: { display: true, text: "Amount" },
            grid: { color: "#F3F0E9" },
          },
          x: { grid: { color: "#F3F0E9" } },
        },
      },
    });

    return () => chart.destroy();
  }, [labels, sales, purchases]);

  return (
    <div className="chart-box dashboard-line-wrap">
      <canvas ref={canvasRef} role="img" aria-label="Sales and purchases by day for the last seven days" />
    </div>
  );
}

export function ProductSalesChart({
  labels,
  amounts,
}: {
  labels: string[];
  amounts: number[];
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const hasData = amounts.some((amount) => amount > 0);
  const totalAmount = amounts.reduce((total, amount) => total + amount, 0);

  useEffect(() => {
    if (!canvasRef.current) return;

    const chart = new Chart(canvasRef.current, {
      type: "doughnut",
      data: {
        labels: hasData ? labels : ["No data"],
        datasets: [{
          data: hasData ? amounts : [1],
          backgroundColor: hasData ? colors : ["#E6E1D8"],
          borderWidth: 0,
        }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        cutout: "62%",
        plugins: {
          legend: { display: false },
          tooltip: { enabled: hasData },
        },
      },
    });

    return () => chart.destroy();
  }, [amounts, hasData, labels]);

  return (
    <div className="dashboard-product-chart">
      <div className="chart-box dashboard-doughnut">
        <canvas ref={canvasRef} role="img" aria-label={hasData ? `Top products by revenue: ${labels.join(", ")}` : "No top selling product data available"} />
        {!hasData && <span className="dashboard-chart-empty">No data</span>}
      </div>
      {hasData ? (
        <ul className="dashboard-product-legend" aria-label="Share of top product sales revenue">
          {labels.map((label, index) => {
            const percentage = totalAmount > 0
              ? (amounts[index] / totalAmount) * 100
              : 0;
            return (
              <li className="dashboard-product-legend-item" key={`${label}-${index}`}>
                <span className="dashboard-product-legend-swatch" style={{ backgroundColor: colors[index % colors.length] }} aria-hidden="true" />
                <span className="dashboard-product-legend-name" title={label}>{label}</span>
                <span className="dashboard-product-legend-percent">{percentage.toFixed(1)}%</span>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="dashboard-product-legend-empty">No product sales this year</p>
      )}
    </div>
  );
}

export function CustomerSalesChart({
  labels,
  amounts,
}: {
  labels: string[];
  amounts: number[];
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const hasData = amounts.some((amount) => amount > 0);

  useEffect(() => {
    if (!canvasRef.current) return;

    const chart = new Chart(canvasRef.current, {
      type: "pie",
      data: {
        labels: hasData ? labels : ["No data"],
        datasets: [{
          data: hasData ? amounts : [1],
          backgroundColor: hasData ? colors : ["#E6E1D8"],
          borderColor: "#fff",
          borderWidth: 3,
        }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            display: hasData,
            position: "top",
            align: "end",
            labels: { usePointStyle: true, pointStyle: "rectRounded", boxWidth: 14, padding: 10 },
          },
          tooltip: { enabled: hasData },
        },
      },
    });

    return () => chart.destroy();
  }, [amounts, hasData, labels]);

  return (
    <div className="chart-box customer-chart">
      <canvas ref={canvasRef} role="img" aria-label={hasData ? `Top five customers by sales: ${labels.join(", ")}` : "No customer sales data available"} />
      {!hasData && <span className="dashboard-chart-empty">No data</span>}
    </div>
  );
}
