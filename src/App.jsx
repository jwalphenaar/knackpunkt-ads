import { useEffect, useState } from 'react'
import { BrowserRouter, Routes, Route, NavLink } from 'react-router-dom'
import Accounts from './pages/Accounts'
import Campaigns from './pages/Campaigns'
import CampaignDetail from './pages/CampaignDetail'
import AccountDetail from './pages/AccountDetail'
import ResolveData from './pages/ResolveData'
import Totals from './pages/Totals'
import Monitoring from './pages/Monitoring'
import AIAudienceBuilder from './pages/AIAudienceBuilder'
import './App.css'

const THEME_STORAGE_KEY = 'knackpunkt_pulse_theme'

export default function App() {
  const [theme, setTheme] = useState(() => localStorage.getItem(THEME_STORAGE_KEY) || 'pulse')

  useEffect(() => {
    localStorage.setItem(THEME_STORAGE_KEY, theme)
    document.body.classList.remove('theme-pulse', 'theme-crt', 'theme-crt-orange')
    if (theme === 'crt') document.body.classList.add('theme-crt')
    else if (theme === 'crt-orange') document.body.classList.add('theme-crt-orange')
    else document.body.classList.add('theme-pulse')
  }, [theme])

  return (
    <BrowserRouter>
      <div className="app">
        <nav className="sidebar">
          <div className="logo">Knackpunkt<span>Pulse</span></div>
          <div className="theme-picker">
            <label htmlFor="theme-select">Theme</label>
            <select
              id="theme-select"
              value={theme}
              onChange={(e) => setTheme(e.target.value)}
            >
              <option value="pulse">Pulse Dark</option>
              <option value="crt">CRT Groen</option>
              <option value="crt-orange">CRT Oranje</option>
            </select>
          </div>
          <NavLink to="/">Accounts</NavLink>
          <NavLink to="/campaigns">Campagnes</NavLink>
          <NavLink to="/monitoring">Monitoring</NavLink>
          <NavLink to="/ai-builder">AI Builder</NavLink>
          <NavLink to="/totals">Totalen</NavLink>
          <NavLink to="/resolve-data">Resolve Data</NavLink>
        </nav>
        <main className="content">
          <Routes>
            <Route path="/" element={<Accounts />} />
            <Route path="/monitoring" element={<Monitoring />} />
            <Route path="/ai-builder" element={<AIAudienceBuilder />} />
            <Route path="/totals" element={<Totals />} />
            <Route path="/accounts/:id" element={<AccountDetail />} />
            <Route path="/campaigns" element={<Campaigns />} />
            <Route path="/campaigns/:id" element={<CampaignDetail />} />
            <Route path="/resolve-data" element={<ResolveData />} />
          </Routes>
        </main>
      </div>
    </BrowserRouter>
  )
}
