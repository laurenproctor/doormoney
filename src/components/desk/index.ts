/**
 * The Desk register's primitives: the workspace's own small vocabulary of shapes.
 *
 * They take plain props and nothing else. No component here reads the database, calls a server
 * action, starts a payment or knows what a category is: a page works those out and hands down what
 * it found, the same boundary `src/components/domain` holds. See docs/DESK_REGISTER.md and
 * decision 20 in docs/DECISIONS.md.
 */
export { Badge, type BadgeKind } from "@/components/desk/Badge";
export { Card } from "@/components/desk/Card";
export { Kpi, KpiUnit } from "@/components/desk/Kpi";
export { MoneyBar } from "@/components/desk/MoneyBar";
export { RunStrip } from "@/components/desk/RunStrip";
export { Table, RowMenuButton, type DeskColumn, type DeskRow } from "@/components/desk/Table";
export { Tabs, type DeskTab } from "@/components/desk/Tabs";
export { TaskDate, TaskRow } from "@/components/desk/TaskRow";
