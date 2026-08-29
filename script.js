/*
Account Ninja - Financial Account Growth Simulator with Real-time Dashboard
Copyright (C) 2026 Jefferson Richards <Jefferson@richards.plus>

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU General Public License as published by
the Free Software Foundation, either version 3 of the License, or
(at your option) any later version.

This program is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
GNU General Public License for more details.

You should have received a copy of the GNU General Public License
along with this program. If not, see <https://www.gnu.org/licenses/>.
*/

class AccountNinja {
    constructor() {
        this.accounts = JSON.parse(localStorage.getItem('accountsNinjaDB')) || [];
        
        // Migration: Add originalDaysRemaining for existing accounts
        this.accounts.forEach(account => {
            if (account.originalDaysRemaining === undefined) {
                account.originalDaysRemaining = account.daysRemaining;
            }
        });
        
        this.simulationHistory = [];
        
        // Migration: Convert old simulation history format to new format
        const oldHistory = JSON.parse(localStorage.getItem('accountsNinjaSimulationHistory') || '[]');
        if (oldHistory.length > 0 && !oldHistory[0].accounts) {
            // Old format detected, convert to new format
            this.simulationHistory = oldHistory.map((accounts, index) => ({
                accounts: accounts,
                daysPerCycle: 30, // Default for old simulations
                cumulativeDays: index * 30
            }));
        }
        
        this.charts = {};
        this.draggedItem = null;
        this.draggedItemAccountId = null;
        
        // Consistent color palette for all charts
        this.colorPalette = [
            '#2563eb', '#059669', '#dc2626', '#f59e0b', 
            '#8b5cf6', '#06b6d4', '#ef4444', '#10b981',
            '#f97316', '#84cc16', '#ec4899', '#6366f1',
            '#14b8a6', '#f43f5e', '#a855f7', '#22c55e'
        ];
        
        this.initializeElements();
        this.initializeEventListeners();
        this.initializeCharts();
        this.updatePriorities();
        this.renderAccounts();
        this.updateCharts();
    }

    getAccountColor(accountId) {
        // Get consistent color for an account based on its ID
        const accountIndex = this.accounts.findIndex(acc => acc.id === accountId);
        return this.colorPalette[accountIndex % this.colorPalette.length];
    }

    initializeElements() {
        // Input elements
        this.addItemBtn = document.getElementById('addItemBtn');
        this.accountNameInput = document.getElementById('accountName');
        this.goalAmountInput = document.getElementById('goalAmount');
        this.zenWeightInput = document.getElementById('zenWeight');
        this.daysRemainingInput = document.getElementById('daysRemaining');
        
        // Simulation elements
        this.amountToDistributeInput = document.getElementById('amountToDistribute');
        this.distributionCyclesInput = document.getElementById('distributionCyclesInput');
        this.daysPerCycleInput = document.getElementById('daysPerCycle');
        this.distributeBtn = document.getElementById('distributeBtn');
        this.resetBtn = document.getElementById('resetBtn');
        this.distributionMessage = document.getElementById('distributionMessage');
        
        // Data management elements
        this.csvFileInput = document.getElementById('csvFileInput');
        this.importCsvBtn = document.getElementById('importCsvBtn');
        this.downloadCsvBtn = document.getElementById('downloadCsvBtn');
        this.downloadTimelineBtn = document.getElementById('downloadTimelineBtn');
        this.importMessage = document.getElementById('importMessage');
        
        // Table elements
        this.accountsTableBody = document.getElementById('accountsTableBody');
        this.accountsTableFoot = document.getElementById('accountsTableFoot');

        // Resilience: if a cached HTML is missing the tfoot, create it so the
        // totals row still renders.
        if (!this.accountsTableFoot && this.accountsTableBody) {
            const table = this.accountsTableBody.closest('table');
            if (table) {
                const foot = document.createElement('tfoot');
                foot.id = 'accountsTableFoot';
                table.appendChild(foot);
                this.accountsTableFoot = foot;
            }
        }
    }

    initializeEventListeners() {
        this.addItemBtn.addEventListener('click', () => this.addAccount());
        this.distributeBtn.addEventListener('click', () => this.distributeFunds());
        this.resetBtn.addEventListener('click', () => this.resetSimulation());
        this.downloadCsvBtn.addEventListener('click', () => this.downloadCSV());
        this.downloadTimelineBtn.addEventListener('click', () => this.generateTimelineCSV());
        this.importCsvBtn.addEventListener('click', () => this.handleImportCSV());
    }

    initializeCharts() {
        // Cumulative Growth Chart (Stacked Area)
        const cumulativeCtx = document.getElementById('cumulativeGrowthChart').getContext('2d');
        this.charts.cumulative = new Chart(cumulativeCtx, {
            type: 'line',
            data: {
                labels: [],
                datasets: []
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                interaction: {
                    intersect: false,
                    mode: 'index'
                },
                plugins: {
                    legend: {
                        display: true,
                        position: 'top',
                        labels: {
                            usePointStyle: true,
                            padding: 15,
                            font: {
                                size: 11
                            }
                        }
                    },
                    tooltip: {
                        backgroundColor: 'rgba(0, 0, 0, 0.8)',
                        titleColor: '#ffffff',
                        bodyColor: '#ffffff',
                        borderColor: '#2563eb',
                        borderWidth: 1,
                        callbacks: {
                            label: function(context) {
                                return `${context.dataset.label}: $${Math.round(context.parsed.y).toLocaleString()}`;
                            },
                            footer: function(tooltipItems) {
                                const total = tooltipItems.reduce((sum, item) => sum + item.parsed.y, 0);
                                return `Total: $${Math.round(total).toLocaleString()}`;
                            }
                        }
                    }
                },
                scales: {
                    y: {
                        beginAtZero: true,
                        stacked: true,
                        grid: {
                            color: 'rgba(0, 0, 0, 0.1)'
                        },
                        ticks: {
                            callback: function(value) {
                                return '$' + value.toLocaleString();
                            }
                        }
                    },
                    x: {
                        stacked: true,
                        title: {
                            display: true,
                            text: 'Days Elapsed'
                        },
                        grid: {
                            color: 'rgba(0, 0, 0, 0.1)'
                        }
                    }
                }
            }
        });

        // Distribution Chart
        const distributionCtx = document.getElementById('distributionChart').getContext('2d');
        this.charts.distribution = new Chart(distributionCtx, {
            type: 'doughnut',
            data: {
                labels: [],
                datasets: [{
                    data: [],
                    backgroundColor: [],
                    borderWidth: 2,
                    borderColor: '#ffffff'
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        position: 'right',
                        labels: {
                            usePointStyle: true,
                            padding: 15,
                            font: {
                                size: 12
                            }
                        }
                    },
                    tooltip: {
                        callbacks: {
                            label: function(context) {
                                const label = context.label || '';
                                const value = '$' + Math.round(context.parsed).toLocaleString();
                                const total = context.dataset.data.reduce((a, b) => a + b, 0);
                                const percentage = ((context.parsed / total) * 100).toFixed(1);
                                return `${label}: ${value} (${percentage}%)`;
                            }
                        }
                    }
                },
                layout: {
                    padding: {
                        left: 10,
                        right: 10,
                        top: 10,
                        bottom: 10
                    }
                },
                animation: {
                    onComplete: function() {
                        // Custom label rendering after animation completes
                        const chart = this;
                        const ctx = chart.ctx;
                        const dataset = chart.data.datasets[0];
                        const total = dataset.data.reduce((a, b) => a + b, 0);
                        
                        if (total === 0) return;
                        
                        ctx.font = 'bold 11px Arial';
                        ctx.textAlign = 'center';
                        ctx.textBaseline = 'middle';
                        ctx.fillStyle = '#000000';
                        
                        chart.data.labels.forEach((label, index) => {
                            const value = dataset.data[index];
                            const percentage = ((value / total) * 100).toFixed(1);
                            
                            // Only show labels for slices > 5%
                            if (percentage > 5) {
                                const meta = chart.getDatasetMeta(0);
                                const arc = meta.data[index];
                                const centerX = arc.x;
                                const centerY = arc.y;
                                
                                // Calculate label position (slightly inward from center)
                                const angle = (arc.startAngle + arc.endAngle) / 2;
                                const radius = (arc.innerRadius + arc.outerRadius) / 2;
                                const labelX = centerX + Math.cos(angle) * radius * 0.7;
                                const labelY = centerY + Math.sin(angle) * radius * 0.7;
                                
                                // Draw multi-line label
                                const lines = [
                                    label,
                                    '$' + Math.round(value).toLocaleString(),
                                    percentage + '%'
                                ];
                                
                                lines.forEach((line, lineIndex) => {
                                    ctx.fillText(line, labelX, labelY + (lineIndex - 1) * 14);
                                });
                            }
                        });
                    }
                }
            }
        });

        // Days Remaining Chart
        const daysCtx = document.getElementById('daysRemainingChart').getContext('2d');
        this.charts.daysRemaining = new Chart(daysCtx, {
            type: 'bar',
            data: {
                labels: [],
                datasets: [{
                    label: 'Current Amount',
                    data: [],
                    backgroundColor: [],
                    borderColor: [],
                    borderWidth: 1
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        display: false
                    }
                },
                scales: {
                    y: {
                        beginAtZero: true,
                        ticks: {
                            callback: function(value) {
                                return '$' + value.toLocaleString();
                            }
                        }
                    },
                    x: {
                        title: {
                            display: true,
                            text: 'Days Remaining'
                        }
                    }
                }
            }
        });
    }

    updateCharts() {
        this.updateCumulativeChart();
        this.updateDistributionChart();
        this.updateDaysRemainingChart();
    }

    updateCumulativeChart() {
        if (this.simulationHistory.length === 0) {
            // Show current state only
            this.charts.cumulative.data.labels = ['Day 0'];
            this.charts.cumulative.data.datasets = this.accounts.map((account, index) => ({
                label: account.name,
                data: [account.currentAmount],
                borderColor: this.getAccountColor(account.id),
                backgroundColor: this.getAccountColor(account.id) + '40', // Add transparency
                borderWidth: 2,
                fill: true,
                tension: 0.4,
                pointBackgroundColor: this.getAccountColor(account.id),
                pointBorderColor: '#ffffff',
                pointBorderWidth: 2,
                pointRadius: 4,
                pointHoverRadius: 6
            }));
        } else {
            // Show progression through all cycles with cumulative days
            this.charts.cumulative.data.labels = this.simulationHistory.map((entry, index) => 
                `Day ${entry.cumulativeDays}`
            );
            
            this.charts.cumulative.data.datasets = this.accounts.map((account, index) => ({
                label: account.name,
                data: this.simulationHistory.map(entry => {
                    const accountInCycle = entry.accounts.find(acc => acc.id === account.id);
                    return accountInCycle ? accountInCycle.currentAmount : 0;
                }),
                borderColor: this.getAccountColor(account.id),
                backgroundColor: this.getAccountColor(account.id) + '40', // Add transparency
                borderWidth: 2,
                fill: true,
                tension: 0.4,
                pointBackgroundColor: this.getAccountColor(account.id),
                pointBorderColor: '#ffffff',
                pointBorderWidth: 2,
                pointRadius: 4,
                pointHoverRadius: 6
            }));
        }
        this.charts.cumulative.update();
    }

    updateDistributionChart() {
        // Only show accounts that have received funds
        const accountsWithFunds = this.accounts.filter(acc => acc.currentAmount > 0);
        
        if (accountsWithFunds.length === 0) {
            this.charts.distribution.data.labels = ['No funds distributed yet'];
            this.charts.distribution.data.datasets[0].data = [1];
            this.charts.distribution.data.datasets[0].backgroundColor = ['#e5e7eb'];
        } else {
            const accountNames = accountsWithFunds.map(acc => acc.name);
            const accountValues = accountsWithFunds.map(acc => acc.currentAmount);
            const accountColors = accountsWithFunds.map(acc => this.getAccountColor(acc.id));
            
            this.charts.distribution.data.labels = accountNames;
            this.charts.distribution.data.datasets[0].data = accountValues;
            this.charts.distribution.data.datasets[0].backgroundColor = accountColors;
        }
        
        this.charts.distribution.update();
    }

    updateDaysRemainingChart() {
        // Sort accounts by days remaining for better visualization
        const sortedAccounts = [...this.accounts].sort((a, b) => a.daysRemaining - b.daysRemaining);
        
        this.charts.daysRemaining.data.labels = sortedAccounts.map(acc => 
            `${acc.name} (${acc.daysRemaining}d)`
        );
        this.charts.daysRemaining.data.datasets[0].data = sortedAccounts.map(acc => acc.currentAmount);
        this.charts.daysRemaining.data.datasets[0].backgroundColor = sortedAccounts.map(acc => 
            this.getAccountColor(acc.id) + 'CC' // Add some transparency
        );
        this.charts.daysRemaining.data.datasets[0].borderColor = sortedAccounts.map(acc => 
            this.getAccountColor(acc.id)
        );
        this.charts.daysRemaining.update();
    }

    getTotalValue() {
        return this.accounts.reduce((total, account) => total + account.currentAmount, 0);
    }

    saveAccounts() {
        localStorage.setItem('accountsNinjaDB', JSON.stringify(this.accounts));
    }

    updatePriorities() {
        this.accounts.forEach((account, index) => {
            account.priority = index + 1;
        });
    }

    saveAndRender() {
        this.saveAccounts();
        this.renderAccounts();
        this.updateCharts();
    }

    addAccount() {
        const name = this.accountNameInput.value.trim();
        const goalAmount = parseFloat(this.goalAmountInput.value);
        const zenWeight = parseFloat(this.zenWeightInput.value);
        const daysRemaining = parseInt(this.daysRemainingInput.value);

        if (!name || isNaN(goalAmount) || isNaN(zenWeight) || isNaN(daysRemaining)) {
            this.showMessage('Please fill in all fields with valid values.', 'error');
            return;
        }
        if (goalAmount <= 0 || zenWeight < 1 || zenWeight > 3 || daysRemaining < 0) {
            this.showMessage('Please enter valid values (Goal > 0, 3Zen 1-3, Days >= 0).', 'error');
            return;
        }

        this.accounts.push({
            id: Date.now() + Math.random(),
            name,
            goalAmount,
            currentAmount: 0,
            priority: 0,
            zenWeight,
            daysRemaining,
            originalDaysRemaining: daysRemaining  // Store original value for reset
        });

        this.updatePriorities();
        this.clearInputs();
        this.saveAndRender();
        this.showMessage(`Account "${name}" added successfully!`, 'success');
    }

    clearInputs() {
        [this.accountNameInput, this.goalAmountInput, this.zenWeightInput, this.daysRemainingInput]
            .forEach(input => input.value = '');
    }

    showMessage(text, type = 'info') {
        this.distributionMessage.textContent = text;
        this.distributionMessage.className = `message ${type}`;
        setTimeout(() => {
            this.distributionMessage.textContent = '';
            this.distributionMessage.className = 'message';
        }, 5000);
    }

    // Format a dollar amount rounded to the nearest whole dollar.
    formatDollars(amount) {
        return `$${Math.round(amount).toLocaleString()}`;
    }

    // Compute each account's share of the current total as whole percentages
    // that sum to exactly 100 (largest-remainder / Hamilton method).
    // Returns a Map keyed by account id -> integer percent.
    computePercentShares() {
        const shares = new Map();
        const total = this.accounts.reduce((sum, acc) => sum + acc.currentAmount, 0);

        if (total <= 0) {
            this.accounts.forEach(acc => shares.set(acc.id, 0));
            return shares;
        }

        // Exact percentage and its floor for each account.
        const entries = this.accounts.map(acc => {
            const exact = (acc.currentAmount / total) * 100;
            const floor = Math.floor(exact);
            return { id: acc.id, floor, remainder: exact - floor };
        });

        let allocated = entries.reduce((sum, e) => sum + e.floor, 0);
        let leftover = 100 - allocated;

        // Distribute the remaining whole percents to the largest remainders.
        entries
            .slice()
            .sort((a, b) => b.remainder - a.remainder)
            .forEach(e => {
                if (leftover > 0) {
                    e.floor += 1;
                    leftover -= 1;
                }
            });

        entries.forEach(e => shares.set(e.id, e.floor));
        return shares;
    }

    renderAccounts() {
        this.accountsTableBody.innerHTML = '';
        if (this.accountsTableFoot) this.accountsTableFoot.innerHTML = '';
        
        if (this.accounts.length === 0) {
            const row = this.accountsTableBody.insertRow();
            const cell = row.insertCell();
            cell.colSpan = 10;
            cell.textContent = 'No accounts yet. Add some to get started!';
            cell.style.textAlign = 'center';
            cell.style.padding = '2rem';
            cell.style.color = '#6b7280';
            return;
        }

        const percentShares = this.computePercentShares();

        this.accounts.forEach((account) => {
            const row = this.accountsTableBody.insertRow();
            row.dataset.accountId = account.id;
            row.draggable = true;
            this.addDragListeners(row);

            // Account Name
            row.insertCell().textContent = account.name;

            // % of Total (current amount relative to current total)
            const percentCell = row.insertCell();
            percentCell.textContent = `${percentShares.get(account.id) || 0}%`;
            
            // Goal Amount
            row.insertCell().textContent = this.formatDollars(account.goalAmount);
            
            // Current Amount (editable)
            const currentAmountCell = row.insertCell();
            const currentAmountInput = document.createElement('input');
            currentAmountInput.type = 'number';
            currentAmountInput.className = 'current-amount-input';
            currentAmountInput.value = account.currentAmount.toFixed(2);
            currentAmountInput.min = 0;
            currentAmountInput.step = "0.01";
            currentAmountInput.addEventListener('change', () => {
                const newValue = parseFloat(currentAmountInput.value);
                if (!isNaN(newValue) && newValue >= 0) {
                    account.currentAmount = newValue;
                    this.saveAndRender();
                } else {
                    currentAmountInput.value = account.currentAmount.toFixed(2);
                }
            });
            currentAmountCell.appendChild(currentAmountInput);

            // Remaining Amount
            const remaining = Math.max(0, account.goalAmount - account.currentAmount);
            row.insertCell().textContent = this.formatDollars(remaining);
            
            // Priority
            row.insertCell().textContent = account.priority;

            // Zen Weight (editable)
            const zenCell = row.insertCell();
            const zenInput = document.createElement('input');
            zenInput.type = 'number';
            zenInput.step = '0.1';
            zenInput.min = '1';
            zenInput.max = '3';
            zenInput.value = account.zenWeight;
            zenInput.addEventListener('change', () => {
                const newValue = parseFloat(zenInput.value);
                if (!isNaN(newValue) && newValue >= 1 && newValue <= 3) {
                    account.zenWeight = newValue;
                    this.saveAndRender();
                } else {
                    zenInput.value = account.zenWeight;
                }
            });
            zenCell.appendChild(zenInput);

            // Days Remaining (editable)
            const daysCell = row.insertCell();
            const daysInput = document.createElement('input');
            daysInput.type = 'number';
            daysInput.value = account.daysRemaining;
            daysInput.min = 0;
            daysInput.addEventListener('change', () => {
                const newValue = parseInt(daysInput.value);
                if (!isNaN(newValue) && newValue >= 0) {
                    account.daysRemaining = newValue;
                    account.originalDaysRemaining = newValue;  // Update original when manually changed
                    this.saveAndRender();
                } else {
                    daysInput.value = account.daysRemaining;
                }
            });
            daysCell.appendChild(daysInput);

            // Progress Bar
            const progressCell = row.insertCell();
            const progressBar = document.createElement('div');
            progressBar.className = 'progress-bar';
            const progressFill = document.createElement('div');
            progressFill.className = 'progress-fill';
            const progressPercent = Math.min(100, (account.currentAmount / account.goalAmount) * 100);
            progressFill.style.width = `${progressPercent}%`;
            progressBar.appendChild(progressFill);
            progressCell.appendChild(progressBar);

            // Actions
            const actionsCell = row.insertCell();
            const deleteBtn = document.createElement('button');
            deleteBtn.textContent = 'Delete';
            deleteBtn.className = 'btn btn-danger';
            deleteBtn.addEventListener('click', () => {
                if (confirm(`Are you sure you want to delete "${account.name}"?`)) {
                    this.accounts = this.accounts.filter(acc => acc.id !== account.id);
                    this.updatePriorities();
                    this.saveAndRender();
                }
            });
            actionsCell.appendChild(deleteBtn);
        });

        this.renderTotalsRow();
    }

    renderTotalsRow() {
        if (!this.accountsTableFoot) return;
        this.accountsTableFoot.innerHTML = '';

        const totalGoal = this.accounts.reduce((sum, acc) => sum + acc.goalAmount, 0);
        const totalCurrent = this.accounts.reduce((sum, acc) => sum + acc.currentAmount, 0);
        const totalRemaining = this.accounts.reduce(
            (sum, acc) => sum + Math.max(0, acc.goalAmount - acc.currentAmount), 0);

        const row = this.accountsTableFoot.insertRow();
        row.className = 'totals-row';

        // Label under Account Name
        const labelCell = row.insertCell();
        labelCell.textContent = 'Totals';

        // % of Total column (always sums to 100 when funds exist)
        const percentCell = row.insertCell();
        percentCell.textContent = totalCurrent > 0 ? '100%' : '0%';

        // Goal, Current, Remaining totals (rounded to the nearest dollar)
        row.insertCell().textContent = this.formatDollars(totalGoal);
        row.insertCell().textContent = this.formatDollars(totalCurrent);
        row.insertCell().textContent = this.formatDollars(totalRemaining);

        // Remaining columns: Priority, 3Zen Weight, Days Left, Progress, Actions
        const spacer = row.insertCell();
        spacer.colSpan = 5;
    }

    addDragListeners(row) {
        row.addEventListener('dragstart', (e) => this.handleDragStart(e));
        row.addEventListener('dragover', (e) => this.handleDragOver(e));
        row.addEventListener('dragleave', (e) => this.handleDragLeave(e));
        row.addEventListener('drop', (e) => this.handleDrop(e));
        row.addEventListener('dragend', (e) => this.handleDragEnd(e));
    }

    handleDragStart(e) {
        this.draggedItem = e.target;
        this.draggedItemAccountId = this.draggedItem.dataset.accountId;
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', this.draggedItemAccountId);
        setTimeout(() => {
            if (this.draggedItem) this.draggedItem.classList.add('dragging');
        }, 0);
    }

    handleDragOver(e) {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        const targetRow = e.target.closest('tr');
        if (targetRow && targetRow !== this.draggedItem && targetRow.dataset.accountId) {
            document.querySelectorAll('#accountsTableBody tr.drag-over').forEach(row => 
                row.classList.remove('drag-over'));
            targetRow.classList.add('drag-over');
        }
    }

    handleDragLeave(e) {
        e.target.closest('tr')?.classList.remove('drag-over');
    }

    handleDrop(e) {
        e.preventDefault();
        const targetRow = e.target.closest('tr');
        document.querySelectorAll('#accountsTableBody tr.drag-over').forEach(row => 
            row.classList.remove('drag-over'));
        
        if (!targetRow || !this.draggedItem || targetRow === this.draggedItem || !this.draggedItemAccountId) {
            return;
        }

        const draggedAccountIndex = this.accounts.findIndex(acc => 
            String(acc.id) === String(this.draggedItemAccountId));
        if (draggedAccountIndex === -1) return;

        const [draggedAccountObject] = this.accounts.splice(draggedAccountIndex, 1);
        let targetAccountIndex = this.accounts.findIndex(acc => 
            String(acc.id) === String(targetRow.dataset.accountId));
        
        if (targetAccountIndex === -1) {
            this.accounts.push(draggedAccountObject);
        } else {
            const rect = targetRow.getBoundingClientRect();
            if (e.clientY >= (rect.top + rect.height / 2)) {
                this.accounts.splice(targetAccountIndex + 1, 0, draggedAccountObject);
            } else {
                this.accounts.splice(targetAccountIndex, 0, draggedAccountObject);
            }
        }
        
        this.updatePriorities();
        this.saveAndRender();
    }

    handleDragEnd(e) {
        if (this.draggedItem) {
            this.draggedItem.classList.remove('dragging');
        }
        document.querySelectorAll('#accountsTableBody tr.drag-over').forEach(row => 
            row.classList.remove('drag-over'));
        this.draggedItem = null;
        this.draggedItemAccountId = null;
    }

    runSingleDistributionCycle(accountsToProcess, amountForCycle, isTimelineSimulation = false) {
        let moneyGivenInThisCycle = 0;
        const maxIterations = 10;
        let iterations = 0;
        let currentAmountToDistribute = amountForCycle;

        while (currentAmountToDistribute > 0.01 && iterations < maxIterations) {
            iterations++;
            let moneyGivenThisPass = 0;
            let eligibleAccounts = accountsToProcess.filter(acc => {
                // An account is eligible as long as it still needs funds.
                // Days Remaining is a priority/urgency signal (see calculatedWeight
                // below), NOT an on/off switch: 0 days means "no future deadline /
                // fund now," which is the MOST urgent case, so those accounts must
                // still participate. Excluding them would silently distribute
                // nothing whenever every account is at 0 days remaining.
                return acc.currentAmount < acc.goalAmount;
            });
            
            if (eligibleAccounts.length === 0) break;

            let totalCalculatedWeight = 0;
            eligibleAccounts.forEach(acc => {
                acc.calculatedWeight = (acc.zenWeight * (1 / (acc.daysRemaining + 0.001))) / acc.priority;
                totalCalculatedWeight += acc.calculatedWeight;
            });

            if (totalCalculatedWeight === 0) break;

            for (const acc of eligibleAccounts) {
                const needed = acc.goalAmount - acc.currentAmount;
                if (needed <= 0) continue;
                const proportionalShare = (acc.calculatedWeight / totalCalculatedWeight) * currentAmountToDistribute;
                const amountToGive = Math.min(proportionalShare, needed);
                if (amountToGive > 0.009) {
                    acc.currentAmount += amountToGive;
                    moneyGivenThisPass += amountToGive;
                }
            }
            
            if (moneyGivenThisPass < 0.01) break;
            currentAmountToDistribute -= moneyGivenThisPass;
            moneyGivenInThisCycle += moneyGivenThisPass;
        }
        return moneyGivenInThisCycle;
    }

    distributeFunds() {
        const amountPerCycle = parseFloat(this.amountToDistributeInput.value);
        const numCyclesRequested = parseInt(this.distributionCyclesInput.value) || 1;
        const daysPerCycle = parseInt(this.daysPerCycleInput.value) || 30;
        
        if (isNaN(amountPerCycle) || amountPerCycle <= 0 || numCyclesRequested < 1 || daysPerCycle < 1) {
            this.showMessage('Please enter valid Amount to Allocate, Sets of Days to Allocate, and Days till Next Allocation values.', 'error');
            return;
        }

        // Store initial state if this is the first simulation
        if (this.simulationHistory.length === 0) {
            this.simulationHistory.push({
                accounts: JSON.parse(JSON.stringify(this.accounts)),
                daysPerCycle: 0,
                cumulativeDays: 0
            });
        }

        let grandTotalDistributed = 0;
        let cycleReport = [];
        let actualCyclesProcessed = 0;

        for (let cycle = 1; cycle <= numCyclesRequested; cycle++) {
            actualCyclesProcessed = cycle;
            // Allocate to any account that still needs funds. Days Remaining
            // drives urgency (weighting), not eligibility -- accounts at 0 days
            // are treated as most urgent and keep receiving funds.
            const moneyGivenInThisCycle = this.runSingleDistributionCycle(this.accounts, amountPerCycle, true);
            grandTotalDistributed += moneyGivenInThisCycle;
            
            // Reduce days remaining for all accounts after each cycle
            this.accounts.forEach(account => {
                account.daysRemaining = Math.max(0, account.daysRemaining - daysPerCycle);
            });
            
            // Store this cycle's state with cumulative days (after days reduction)
            const previousEntry = this.simulationHistory[this.simulationHistory.length - 1];
            const cumulativeDays = previousEntry.cumulativeDays + daysPerCycle;
            this.simulationHistory.push({
                accounts: JSON.parse(JSON.stringify(this.accounts)),
                daysPerCycle: daysPerCycle,
                cumulativeDays: cumulativeDays
            });
            
            let cycleMessage = `Cycle ${cycle}: Distributed $${moneyGivenInThisCycle.toFixed(2)} (${daysPerCycle} days elapsed)`;
            cycleReport.push(cycleMessage);
            if (moneyGivenInThisCycle < amountPerCycle) {
                const anyAccountNeedsFunding = this.accounts.some(acc => acc.currentAmount < acc.goalAmount);
                if (!anyAccountNeedsFunding) {
                    cycleReport.push('All accounts are fully funded or out of time. Stopping simulation.');
                    break;
                } else if (moneyGivenInThisCycle < 0.01) {
                    cycleReport.push('Very little distributed this cycle. Stopping simulation.');
                    break;
                }
            }
        }
        
        const totalValue = this.getTotalValue();
        const theoreticalTotal = amountPerCycle * actualCyclesProcessed;

        this.showMessage(
            `Simulation Complete: Distributed $${Math.round(grandTotalDistributed).toLocaleString()} over ${actualCyclesProcessed} cycle(s) (${actualCyclesProcessed * daysPerCycle} total days). Total portfolio value: $${Math.round(totalValue).toLocaleString()}`,
            'success'
        );
        
        this.saveAndRender();
    }

    resetSimulation() {
        if (confirm('Are you sure you want to reset all account balances and days remaining?')) {
            this.accounts.forEach(account => {
                account.currentAmount = 0;
                // Reset days remaining to original value if available, otherwise keep current
                if (account.originalDaysRemaining !== undefined) {
                    account.daysRemaining = account.originalDaysRemaining;
                }
            });
            this.simulationHistory = []; // Clear simulation history
            this.saveAndRender();
            this.showMessage('Simulation reset successfully!', 'success');
        }
    }

    downloadCSV() {
        if (this.accounts.length === 0) {
            this.showMessage('No accounts to export.', 'error');
            return;
        }

        const headers = ['Account Name', 'Goal Amount ($)', 'Current Amount ($)', 'Remaining ($)', 'Priority', '3Zen Weight', 'Days Remaining'];
        const csvContent = [
            headers,
            ...this.accounts.map(account => [
                this.escapeCsvValue(account.name),
                account.goalAmount.toFixed(2),
                account.currentAmount.toFixed(2),
                Math.max(0, account.goalAmount - account.currentAmount).toFixed(2),
                account.priority,
                account.zenWeight,
                account.daysRemaining
            ])
        ].map(row => row.join(',')).join('\n');

        this.downloadCsvContent(csvContent, 'account_ninja_snapshot.csv');
        this.showMessage('Current state exported successfully!', 'success');
    }

    generateTimelineCSV() {
        const amountPerCycle = parseFloat(this.amountToDistributeInput.value);
        const numCyclesToSimulate = parseInt(this.distributionCyclesInput.value) || 1;
        const daysPerCycle = parseInt(this.daysPerCycleInput.value) || 30;
        
        if (isNaN(amountPerCycle) || amountPerCycle <= 0 || numCyclesToSimulate < 1 || daysPerCycle < 1) {
            this.showMessage('Please enter valid simulation parameters.', 'error');
            return;
        }

        const simAccounts = JSON.parse(JSON.stringify(this.accounts));
        const headers = ['Cycle', 'Account Name', 'Goal Amount ($)', 'Current Amount ($)', 'Remaining ($)', 'Priority', '3Zen Weight', 'Days Remaining'];
        const csvRows = [headers];

        // Add initial state (Cycle 0)
        simAccounts.forEach(acc => {
            const remaining = Math.max(0, acc.goalAmount - acc.currentAmount);
            csvRows.push([
                0, acc.name, acc.goalAmount.toFixed(2), acc.currentAmount.toFixed(2),
                remaining.toFixed(2), acc.priority, acc.zenWeight, acc.daysRemaining
            ]);
        });

        // Run simulation
        for (let cycle = 1; cycle <= numCyclesToSimulate; cycle++) {
            this.runSingleDistributionCycle(simAccounts, amountPerCycle, true);

            simAccounts.forEach(acc => {
                acc.daysRemaining = Math.max(0, acc.daysRemaining - daysPerCycle);
            });

            simAccounts.forEach(acc => {
                const remaining = Math.max(0, acc.goalAmount - acc.currentAmount);
                csvRows.push([
                    cycle, acc.name, acc.goalAmount.toFixed(2), acc.currentAmount.toFixed(2),
                    remaining.toFixed(2), acc.priority, acc.zenWeight, acc.daysRemaining
                ]);
            });

            // Stop early only when every account is fully funded. Days Remaining
            // no longer gates eligibility, so "out of time" is not a stopping
            // condition -- accounts at 0 days keep receiving funds each cycle.
            const allFunded = simAccounts.every(acc => acc.currentAmount >= acc.goalAmount);
            if (allFunded) break;
        }

        const csvContent = csvRows.map(row => row.map(this.escapeCsvValue).join(',')).join('\n');
        this.downloadCsvContent(csvContent, 'account_ninja_timeline.csv');
        this.showMessage('Timeline simulation exported successfully!', 'success');
    }

    downloadCsvContent(csvContent, fileName) {
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement('a');
        if (link.download !== undefined) {
            const url = URL.createObjectURL(blob);
            link.setAttribute('href', url);
            link.setAttribute('download', fileName);
            link.style.visibility = 'hidden';
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            URL.revokeObjectURL(url);
        } else {
            this.showMessage('CSV download not supported by your browser.', 'error');
        }
    }

    handleImportCSV() {
        const file = this.csvFileInput.files[0];
        if (!file) {
            this.showMessage('Please select a CSV file.', 'error');
            return;
        }

        const reader = new FileReader();
        reader.onload = (event) => {
            try {
                const csvData = event.target.result;
                const newAccounts = [];
                const lines = csvData.split(/\r\n|\n/);
                const startIndex = lines[0].toLowerCase().includes('account name') ? 1 : 0;

                for (let i = startIndex; i < lines.length; i++) {
                    const line = lines[i].trim();
                    if (!line) continue;

                    const values = this.parseCsvRowRobust(line);
                    if (values.length < 5) continue;

                    const name = values[0];
                    const goalAmount = parseFloat(values[1]);
                    const currentAmount = parseFloat(values[2]);
                    const zenWeight = values.length >= 7 ? parseFloat(values[5]) : parseFloat(values[3]);
                    const daysRemaining = values.length >= 7 ? parseInt(values[6]) : parseInt(values[4]);

                    if (name && !isNaN(goalAmount) && !isNaN(currentAmount) && 
                        !isNaN(zenWeight) && !isNaN(daysRemaining) &&
                        goalAmount > 0 && currentAmount >= 0 && 
                        zenWeight >= 1 && zenWeight <= 3 && daysRemaining >= 0) {
                        
                        newAccounts.push({
                            id: Date.now() + i + Math.random(),
                            name, goalAmount, currentAmount,
                            priority: 0, zenWeight, daysRemaining,
                            originalDaysRemaining: daysRemaining  // Store original value for reset
                        });
                    }
                }

                if (newAccounts.length > 0) {
                    this.accounts = newAccounts;
                    this.simulationHistory = [];
                    this.updatePriorities();
                    this.saveAndRender();
                    this.showMessage(`Successfully imported ${newAccounts.length} accounts.`, 'success');
                } else {
                    this.showMessage('No valid accounts found in CSV.', 'error');
                }
            } catch (error) {
                this.showMessage('Failed to parse CSV file.', 'error');
            }
            this.csvFileInput.value = '';
        };

        reader.onerror = () => {
            this.showMessage('Failed to read file.', 'error');
            this.csvFileInput.value = '';
        };

        reader.readAsText(file);
    }

    escapeCsvValue(value) {
        if (value == null) return '';
        const stringValue = String(value);
        if (stringValue.includes(',') || stringValue.includes('"') || stringValue.includes('\n')) {
            return `"${stringValue.replace(/"/g, '""')}"`;
        }
        return stringValue;
    }

    parseCsvRowRobust(rowStr) {
        const result = [];
        let currentField = '';
        let inQuotes = false;
        
        for (let i = 0; i < rowStr.length; i++) {
            const char = rowStr[i];
            if (char === '"') {
                if (inQuotes && i + 1 < rowStr.length && rowStr[i + 1] === '"') {
                    currentField += '"';
                    i++;
                } else {
                    inQuotes = !inQuotes;
                }
            } else if (char === ',' && !inQuotes) {
                result.push(currentField.trim());
                currentField = '';
            } else {
                currentField += char;
            }
        }
        result.push(currentField.trim());
        return result;
    }
}

// Initialize the application when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    new AccountNinja();
});