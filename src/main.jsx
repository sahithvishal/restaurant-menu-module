import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import App from './App'
import { AuthProvider } from './contexts/AuthContext'
import { UIProvider } from './contexts/UIContext'
import './index.css'

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode><BrowserRouter><UIProvider><AuthProvider><App /></AuthProvider></UIProvider></BrowserRouter></React.StrictMode>
)
