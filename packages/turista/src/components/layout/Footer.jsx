import { MapPin } from 'lucide-react'
import { Link } from 'react-router-dom'

export default function Footer() {
  return (
    <footer className="bg-gray-900 text-gray-400 mt-20">
      <div className="max-w-6xl mx-auto px-4 py-12">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          <div>
            <div className="flex items-center gap-2 mb-3">
              <div className="w-7 h-7 bg-brand rounded-lg flex items-center justify-center">
                <MapPin size={14} className="text-white" />
              </div>
              <span className="font-display font-bold text-white text-lg">Giro Jeri</span>
            </div>
            <p className="text-sm leading-relaxed">
              Passeios e transfers em Jericoacoara. <br />
              Experiências únicas no paraíso dos ventos.
            </p>
          </div>

          <div>
            <h4 className="text-white font-semibold text-sm mb-3">Explore</h4>
            <ul className="space-y-2 text-sm">
              <li><Link to="/passeios"  className="hover:text-white transition-colors">Passeios</Link></li>
              <li><Link to="/transfers" className="hover:text-white transition-colors">Transfers</Link></li>
              <li><Link to="/minhas-reservas" className="hover:text-white transition-colors">Minhas Reservas</Link></li>
            </ul>
          </div>

          <div>
            <h4 className="text-white font-semibold text-sm mb-3">Contato</h4>
            <ul className="space-y-2 text-sm">
              <li>Jericoacoara, CE — Brasil</li>
              <li>contato@girojeri.com.br</li>
              <li>(88) 9 9999-9999</li>
            </ul>
          </div>
        </div>

        <div className="border-t border-gray-800 mt-10 pt-6 text-xs text-center">
          © {new Date().getFullYear()} Giro Jeri. Todos os direitos reservados.
        </div>
      </div>
    </footer>
  )
}
