import { BrowserRouter, Routes, Route, NavLink } from 'react-router-dom'
import Accounts from './pages/Accounts'
import Campaigns from './pages/Campaigns'
import CampaignDetail from './pages/CampaignDetail'
import AccountDetail from './pages/AccountDetail'
import './App.css'

export default function App() {
  return (
    <BrowserRouter>
      <div className="app">
        <nav className="sidebar">
          <div className="logo">Knackpunkt<span>Ads</span></div>
          <NavLink to="/">Accounts</NavLink>
          <NavLink to="/campaigns">Campagnes</NavLink>
        </nav>
        <main className="content">
          <Routes>
            <Route path="/" element={<Accounts />} />
            <Route path="/accounts/:id" element={<AccountDetail />} />
            <Route path="/campaigns" element={<Campaigns />} />
            <Route path="/campaigns/:id" element={<CampaignDetail />} />
          </Routes>
        </main>
      </div>
    </BrowserRouter>
  )
}
