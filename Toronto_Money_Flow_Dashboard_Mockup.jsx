import React, { useState } from 'react';

const TorontoMoneyFlowMockup = () => {
  const [selectedYear, setSelectedYear] = useState('2024');
  const [selectedWard, setSelectedWard] = useState(null);
  const [activeTab, setActiveTab] = useState('overview');

  // Mock data
  const sources = [
    { name: 'Property Taxes', amount: 5200, pct: 48, color: '#2563eb' },
    { name: 'Provincial Grants', amount: 1800, pct: 17, color: '#7c3aed' },
    { name: 'User Fees', amount: 1800, pct: 17, color: '#059669' },
    { name: 'Federal Grants', amount: 890, pct: 8, color: '#dc2626' },
    { name: 'Dev Charges', amount: 650, pct: 6, color: '#d97706' },
    { name: 'Other', amount: 460, pct: 4, color: '#6b7280' },
  ];

  const uses = [
    { name: 'TTC Transit', amount: 2800, pct: 26, color: '#dc2626' },
    { name: 'Police Services', amount: 1200, pct: 11, color: '#1e40af' },
    { name: 'Shelter & Housing', amount: 980, pct: 9, color: '#7c3aed' },
    { name: 'Fire Services', amount: 650, pct: 6, color: '#ea580c' },
    { name: 'Parks & Rec', amount: 580, pct: 5, color: '#16a34a' },
    { name: 'Toronto Water', amount: 520, pct: 5, color: '#0891b2' },
    { name: 'Solid Waste', amount: 420, pct: 4, color: '#65a30d' },
    { name: 'Transportation', amount: 380, pct: 4, color: '#4f46e5' },
    { name: 'Other Programs', amount: 3270, pct: 30, color: '#6b7280' },
  ];

  const topContracts = [
    { vendor: 'Damen Shipbuilding B.V.', amount: 90.5, project: 'Ferry Vessels for Toronto Island', division: 'Parks & Rec', country: '🇳🇱' },
    { vendor: 'GIP Paving Inc', amount: 89.1, project: 'Basement Flooding Program - Phase 2', division: 'Engineering', country: '🇨🇦' },
    { vendor: 'Drainstar Contracting Ltd', amount: 65.9, project: 'Fairbank Silverthorn Sewers', division: 'Engineering', country: '🇨🇦' },
    { vendor: 'Erritt Construction Ltd', amount: 27.6, project: 'Watermain - Rowanwood Ave', division: 'Engineering', country: '🇨🇦' },
    { vendor: 'Schindler Elevator Corp', amount: 19.8, project: 'Elevator Maintenance City-wide', division: 'Real Estate', country: '🇨🇦' },
  ];

  const wards = [
    { id: 1, name: 'Etobicoke North', investment: 245, perCapita: 1820, rank: 15 },
    { id: 2, name: 'Etobicoke Centre', investment: 198, perCapita: 1650, rank: 18 },
    { id: 10, name: 'Spadina-Fort York', investment: 412, perCapita: 2890, rank: 3 },
    { id: 11, name: 'University-Rosedale', investment: 287, perCapita: 2727, rank: 8 },
    { id: 13, name: 'Toronto Centre', investment: 356, perCapita: 2450, rank: 6 },
  ];

  const SankeyDiagram = () => (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
      <h3 className="text-lg font-semibold text-gray-900 mb-4">Money Flow: Sources → Uses</h3>
      <div className="flex items-stretch justify-between h-80">
        {/* Sources */}
        <div className="w-1/4 flex flex-col justify-center space-y-1">
          {sources.map((s, i) => (
            <div key={i} className="group cursor-pointer">
              <div 
                className="rounded-r-lg px-3 py-2 text-white text-sm font-medium transition-all hover:translate-x-1"
                style={{ 
                  backgroundColor: s.color,
                  height: `${Math.max(s.pct * 1.5, 24)}px`,
                  display: 'flex',
                  alignItems: 'center'
                }}
              >
                <span className="truncate">{s.name}</span>
              </div>
              <div className="text-xs text-gray-500 mt-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                ${s.amount}M ({s.pct}%)
              </div>
            </div>
          ))}
        </div>

        {/* Flow lines */}
        <div className="flex-1 relative mx-4">
          <svg className="w-full h-full" viewBox="0 0 200 300" preserveAspectRatio="none">
            <defs>
              <linearGradient id="flowGrad" x1="0%" y1="0%" x2="100%" y2="0%">
                <stop offset="0%" stopColor="#2563eb" stopOpacity="0.3" />
                <stop offset="100%" stopColor="#dc2626" stopOpacity="0.3" />
              </linearGradient>
            </defs>
            {/* Simplified flow paths */}
            <path d="M 0,30 C 100,30 100,20 200,20" stroke="#2563eb" strokeWidth="20" fill="none" opacity="0.4" />
            <path d="M 0,70 C 100,70 100,55 200,55" stroke="#7c3aed" strokeWidth="12" fill="none" opacity="0.4" />
            <path d="M 0,100 C 100,100 100,85 200,85" stroke="#059669" strokeWidth="12" fill="none" opacity="0.4" />
            <path d="M 0,130 C 100,130 100,110 200,110" stroke="#dc2626" strokeWidth="8" fill="none" opacity="0.4" />
            <path d="M 0,155 C 100,155 100,135 200,135" stroke="#d97706" strokeWidth="6" fill="none" opacity="0.4" />
            <path d="M 0,175 C 100,175 100,160 200,160" stroke="#6b7280" strokeWidth="5" fill="none" opacity="0.4" />
            {/* More flow lines to uses */}
            <path d="M 0,50 C 100,50 100,200 200,200" stroke="#2563eb" strokeWidth="8" fill="none" opacity="0.3" />
            <path d="M 0,85 C 100,85 100,230 200,230" stroke="#7c3aed" strokeWidth="6" fill="none" opacity="0.3" />
            <path d="M 0,115 C 100,115 100,260 200,260" stroke="#059669" strokeWidth="5" fill="none" opacity="0.3" />
          </svg>
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="bg-gray-100 rounded-full px-4 py-2 text-sm font-semibold text-gray-700 shadow-sm">
              $10.8B Total
            </div>
          </div>
        </div>

        {/* Uses */}
        <div className="w-1/4 flex flex-col justify-center space-y-1">
          {uses.map((u, i) => (
            <div key={i} className="group cursor-pointer">
              <div 
                className="rounded-l-lg px-3 py-2 text-white text-sm font-medium transition-all hover:-translate-x-1 text-right"
                style={{ 
                  backgroundColor: u.color,
                  height: `${Math.max(u.pct * 1.2, 20)}px`,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'flex-end'
                }}
              >
                <span className="truncate">{u.name}</span>
              </div>
              <div className="text-xs text-gray-500 mt-0.5 text-right opacity-0 group-hover:opacity-100 transition-opacity">
                ${u.amount}M ({u.pct}%)
              </div>
            </div>
          ))}
        </div>
      </div>
      <div className="mt-4 flex justify-center space-x-8 text-sm text-gray-500">
        <span>← Hover for details</span>
        <span>Click to drill down →</span>
      </div>
    </div>
  );

  const WardMap = () => (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
      <div className="flex justify-between items-center mb-4">
        <h3 className="text-lg font-semibold text-gray-900">Investment by Ward</h3>
        <select className="text-sm border rounded-lg px-3 py-1.5 bg-gray-50">
          <option>Per Capita ($)</option>
          <option>Total Investment ($M)</option>
          <option>Project Count</option>
        </select>
      </div>
      
      {/* Simplified Toronto ward map mockup */}
      <div className="relative h-64 bg-gradient-to-br from-blue-50 to-green-50 rounded-lg overflow-hidden">
        <svg viewBox="0 0 400 250" className="w-full h-full">
          {/* Simplified ward shapes */}
          <g className="cursor-pointer">
            {/* Etobicoke */}
            <path d="M 20,50 L 80,30 L 100,80 L 90,120 L 40,130 Z" fill="#bfdbfe" stroke="#3b82f6" strokeWidth="1" className="hover:fill-blue-300 transition-colors" />
            <text x="55" y="80" fontSize="8" fill="#1e40af" textAnchor="middle">1</text>
            
            {/* North York */}
            <path d="M 100,30 L 200,20 L 250,40 L 240,100 L 150,110 L 100,80 Z" fill="#93c5fd" stroke="#3b82f6" strokeWidth="1" className="hover:fill-blue-300 transition-colors" />
            <text x="170" y="65" fontSize="8" fill="#1e40af" textAnchor="middle">6</text>
            
            {/* Scarborough */}
            <path d="M 250,40 L 380,30 L 380,150 L 280,160 L 240,100 Z" fill="#a5b4fc" stroke="#4f46e5" strokeWidth="1" className="hover:fill-indigo-300 transition-colors" />
            <text x="310" y="95" fontSize="8" fill="#3730a3" textAnchor="middle">21</text>
            
            {/* Downtown Core - highlighted */}
            <path d="M 150,110 L 200,105 L 220,140 L 200,180 L 150,175 L 140,140 Z" fill="#fca5a5" stroke="#dc2626" strokeWidth="2" className="hover:fill-red-300 transition-colors" />
            <text x="175" y="145" fontSize="8" fill="#991b1b" textAnchor="middle">10</text>
            
            {/* East York */}
            <path d="M 200,105 L 280,100 L 280,160 L 220,165 L 220,140 Z" fill="#86efac" stroke="#16a34a" strokeWidth="1" className="hover:fill-green-300 transition-colors" />
            <text x="245" y="135" fontSize="8" fill="#166534" textAnchor="middle">14</text>
            
            {/* South Etobicoke */}
            <path d="M 40,130 L 90,120 L 100,160 L 80,200 L 30,190 Z" fill="#d8b4fe" stroke="#9333ea" strokeWidth="1" className="hover:fill-purple-300 transition-colors" />
            <text x="65" y="160" fontSize="8" fill="#6b21a8" textAnchor="middle">3</text>
            
            {/* Waterfront */}
            <path d="M 80,200 L 100,160 L 150,175 L 200,180 L 220,165 L 250,200 L 80,210 Z" fill="#fdba74" stroke="#ea580c" strokeWidth="1" className="hover:fill-orange-300 transition-colors" />
            <text x="160" y="195" fontSize="8" fill="#9a3412" textAnchor="middle">10</text>
          </g>
          
          {/* Lake Ontario */}
          <path d="M 0,220 L 400,220 L 400,250 L 0,250 Z" fill="#e0f2fe" />
          <text x="200" y="238" fontSize="10" fill="#0369a1" textAnchor="middle">Lake Ontario</text>
        </svg>
        
        {/* Legend */}
        <div className="absolute bottom-2 left-2 bg-white/90 rounded-lg p-2 text-xs">
          <div className="font-medium mb-1">$/Capita</div>
          <div className="flex items-center space-x-1">
            <div className="w-4 h-3 bg-blue-200 rounded"></div>
            <span>$1,500</span>
          </div>
          <div className="flex items-center space-x-1">
            <div className="w-4 h-3 bg-red-300 rounded"></div>
            <span>$3,000+</span>
          </div>
        </div>
      </div>
      
      <p className="text-sm text-gray-500 mt-3 text-center">Click any ward for detailed breakdown</p>
    </div>
  );

  const ContractsTable = () => (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
      <div className="flex justify-between items-center mb-4">
        <h3 className="text-lg font-semibold text-gray-900">Top Contracts Awarded</h3>
        <button className="text-sm text-blue-600 hover:text-blue-800 font-medium">
          View All 845 →
        </button>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-200">
              <th className="text-left py-3 px-2 font-medium text-gray-600">Vendor</th>
              <th className="text-right py-3 px-2 font-medium text-gray-600">Amount</th>
              <th className="text-left py-3 px-2 font-medium text-gray-600">Project</th>
              <th className="text-left py-3 px-2 font-medium text-gray-600">Division</th>
            </tr>
          </thead>
          <tbody>
            {topContracts.map((c, i) => (
              <tr key={i} className="border-b border-gray-100 hover:bg-gray-50 cursor-pointer">
                <td className="py-3 px-2">
                  <div className="flex items-center space-x-2">
                    <span>{c.country}</span>
                    <span className="font-medium text-gray-900">{c.vendor}</span>
                  </div>
                </td>
                <td className="py-3 px-2 text-right font-semibold text-green-700">
                  ${c.amount}M
                </td>
                <td className="py-3 px-2 text-gray-600 max-w-xs truncate">
                  {c.project}
                </td>
                <td className="py-3 px-2">
                  <span className="px-2 py-1 bg-gray-100 rounded-full text-xs text-gray-700">
                    {c.division}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );

  const WardDetailPanel = () => (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
      <div className="flex items-start justify-between mb-4">
        <div>
          <h3 className="text-lg font-semibold text-gray-900">Ward 10: Spadina-Fort York</h3>
          <p className="text-sm text-gray-500">Councillor: Ausma Malik</p>
        </div>
        <button 
          onClick={() => setSelectedWard(null)}
          className="text-gray-400 hover:text-gray-600"
        >
          ✕
        </button>
      </div>
      
      <div className="grid grid-cols-3 gap-4 mb-6">
        <div className="bg-blue-50 rounded-lg p-3 text-center">
          <div className="text-2xl font-bold text-blue-700">$412M</div>
          <div className="text-xs text-blue-600">10-Year Total</div>
        </div>
        <div className="bg-green-50 rounded-lg p-3 text-center">
          <div className="text-2xl font-bold text-green-700">$2,890</div>
          <div className="text-xs text-green-600">Per Capita</div>
        </div>
        <div className="bg-purple-50 rounded-lg p-3 text-center">
          <div className="text-2xl font-bold text-purple-700">#3</div>
          <div className="text-xs text-purple-600">of 25 Wards</div>
        </div>
      </div>
      
      <h4 className="font-medium text-gray-700 mb-2">Investment by Category</h4>
      <div className="space-y-2 mb-6">
        {[
          { cat: 'Transit Infrastructure', amt: 185, pct: 45, color: 'bg-red-500' },
          { cat: 'Water & Sewer', amt: 98, pct: 24, color: 'bg-blue-500' },
          { cat: 'Parks & Recreation', amt: 72, pct: 17, color: 'bg-green-500' },
          { cat: 'Roads & Bridges', amt: 57, pct: 14, color: 'bg-orange-500' },
        ].map((item, i) => (
          <div key={i}>
            <div className="flex justify-between text-sm mb-1">
              <span className="text-gray-600">{item.cat}</span>
              <span className="font-medium">${item.amt}M</span>
            </div>
            <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
              <div className={`h-full ${item.color} rounded-full`} style={{ width: `${item.pct}%` }}></div>
            </div>
          </div>
        ))}
      </div>
      
      <h4 className="font-medium text-gray-700 mb-2">Top Projects</h4>
      <div className="space-y-2">
        {[
          { name: 'Ontario Line - Station Construction', budget: '$125M', years: '2024-2030' },
          { name: 'Waterfront Revitalization Phase 3', budget: '$45M', years: '2024-2027' },
          { name: 'CityPlace Park Development', budget: '$28M', years: '2025-2026' },
        ].map((p, i) => (
          <div key={i} className="bg-gray-50 rounded-lg p-3 hover:bg-gray-100 cursor-pointer">
            <div className="font-medium text-gray-900 text-sm">{p.name}</div>
            <div className="flex justify-between text-xs text-gray-500 mt-1">
              <span>{p.budget}</span>
              <span>{p.years}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );

  const QueryInterface = () => (
    <div className="bg-gradient-to-r from-blue-600 to-indigo-600 rounded-xl p-6 text-white">
      <div className="flex items-center space-x-3 mb-4">
        <div className="w-10 h-10 bg-white/20 rounded-full flex items-center justify-center">
          💬
        </div>
        <div>
          <h3 className="font-semibold">Ask about Toronto's finances</h3>
          <p className="text-sm text-blue-100">Powered by AI with real city data</p>
        </div>
      </div>
      <div className="relative">
        <input
          type="text"
          placeholder="e.g., How much is being spent on transit in Ward 10?"
          className="w-full px-4 py-3 rounded-lg bg-white/10 border border-white/20 text-white placeholder-blue-200 focus:outline-none focus:ring-2 focus:ring-white/50"
        />
        <button className="absolute right-2 top-1/2 -translate-y-1/2 bg-white text-blue-600 px-4 py-1.5 rounded-md font-medium text-sm hover:bg-blue-50">
          Ask
        </button>
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        {['Provincial funding trends', 'Top vendors 2024', 'Police budget history'].map((q, i) => (
          <button key={i} className="text-xs bg-white/10 hover:bg-white/20 px-3 py-1 rounded-full border border-white/20">
            {q}
          </button>
        ))}
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <div className="w-10 h-10 bg-gradient-to-br from-blue-600 to-indigo-600 rounded-lg flex items-center justify-center text-white font-bold">
                $
              </div>
              <div>
                <h1 className="text-xl font-bold text-gray-900">Toronto Money Flow</h1>
                <p className="text-xs text-gray-500">Follow the city's finances</p>
              </div>
            </div>
            
            <div className="flex items-center space-x-4">
              <select 
                value={selectedYear}
                onChange={(e) => setSelectedYear(e.target.value)}
                className="border border-gray-300 rounded-lg px-4 py-2 bg-white font-medium"
              >
                <option value="2024">2024</option>
                <option value="2023">2023</option>
                <option value="2022">2022</option>
                <option value="2021">2021</option>
              </select>
              <button className="bg-gray-100 hover:bg-gray-200 px-4 py-2 rounded-lg font-medium text-gray-700">
                Export Data
              </button>
            </div>
          </div>
          
          {/* Tabs */}
          <div className="flex space-x-1 mt-4">
            {['overview', 'sources', 'wards', 'contracts', 'trends'].map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`px-4 py-2 rounded-lg font-medium text-sm capitalize transition-colors ${
                  activeTab === tab 
                    ? 'bg-blue-100 text-blue-700' 
                    : 'text-gray-600 hover:bg-gray-100'
                }`}
              >
                {tab}
              </button>
            ))}
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 py-6 space-y-6">
        {/* Summary Cards */}
        <div className="grid grid-cols-4 gap-4">
          {[
            { label: 'Total Revenue', value: '$10.8B', change: '+3.2%', color: 'text-green-600' },
            { label: 'Operating Budget', value: '$16.8B', change: '+4.1%', color: 'text-green-600' },
            { label: 'Capital Plan (10yr)', value: '$52.3B', change: '+8.5%', color: 'text-green-600' },
            { label: 'Active Contracts', value: '845', change: '+12', color: 'text-blue-600' },
          ].map((card, i) => (
            <div key={i} className="bg-white rounded-xl shadow-sm border border-gray-200 p-4">
              <div className="text-sm text-gray-500 mb-1">{card.label}</div>
              <div className="flex items-end justify-between">
                <span className="text-2xl font-bold text-gray-900">{card.value}</span>
                <span className={`text-sm font-medium ${card.color}`}>{card.change}</span>
              </div>
            </div>
          ))}
        </div>

        {/* Sankey Diagram */}
        <SankeyDiagram />

        {/* Two Column Layout */}
        <div className="grid grid-cols-2 gap-6">
          <WardMap />
          {selectedWard ? <WardDetailPanel /> : <ContractsTable />}
        </div>

        {/* Query Interface */}
        <QueryInterface />

        {/* Footer */}
        <div className="text-center text-sm text-gray-500 py-4 border-t border-gray-200">
          Data sourced from <a href="https://open.toronto.ca" className="text-blue-600 hover:underline">Toronto Open Data</a>. 
          Last updated: December 24, 2025. 
          <a href="#" className="text-blue-600 hover:underline ml-2">Methodology</a>
        </div>
      </main>
    </div>
  );
};

export default TorontoMoneyFlowMockup;
