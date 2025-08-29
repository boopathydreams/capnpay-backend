export interface DashboardInsights {
  month: string;
  totalSpent: number;
  prevMonthDelta: number;
  categories: CategoryInsight[];
  upcomingBills?: UpcomingBill[];
  recentTransactions: TransactionSummary[];
}

export interface CategoryInsight {
  id: string;
  name: string;
  color: string;
  spentThisMonth: number;
  budgetAmount: number;
  percentage: number;
  state: 'healthy' | 'warning' | 'exceeded';
  transactions: number;
}

export interface UpcomingBill {
  id: string;
  name: string;
  amount: number;
  dueDate: string;
  category: string;
}

export interface TransactionSummary {
  id: string;
  amount: number;
  payeeName: string;
  category: string;
  date: string;
  status: 'success' | 'pending' | 'failed';
}
