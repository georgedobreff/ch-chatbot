import ChatInterface from '@/components/ChatInterface';
import DisclaimerModal from '@/components/DisclaimerModal';
import DisclaimerLink from '@/components/DisclaimerLink';
import { Building2 } from 'lucide-react';

export const metadata = {
  title: 'Company Assistant',
  description: 'Free help with anything Companies House related',
};

export default function Home() {
  return (
    <main className="absolute inset-0 bg-white text-[#0b0c0c] font-sans flex flex-col overflow-hidden">
      <DisclaimerModal />
      {/* Full-width GOV.UK Navbar */}
      <header className="bg-[#1d70b8] text-white w-full px-6 py-2 flex items-center justify-between border-b-4 border-[#003078] flex-shrink-0 z-10">
        <div className="max-w-4xl mx-auto w-full flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <Building2 className="w-8 h-8 flex-shrink-0" />
            <div>
              <h1 className="text-xl font-bold tracking-tight m-0">Company Assistant</h1>
            </div>
          </div>

          {/* Navigation Links */}
          <nav className="flex flex-wrap items-center gap-x-6 gap-y-2 mt-2 sm:mt-0 text-sm font-bold">
            <a href="https://ewf.companieshouse.gov.uk/" target="_blank" rel="noopener noreferrer" className="hover:underline">
              File for a company
            </a>
            <a href="https://find-and-update.company-information.service.gov.uk/" target="_blank" rel="noopener noreferrer" className="hover:underline">
              Search the register
            </a>
            <a href="https://www.gov.uk/guidance/verify-your-identity-for-companies-house" target="_blank" rel="noopener noreferrer" className="hover:underline">
              Verify Identity
            </a>
            <DisclaimerLink />
          </nav>
        </div>
      </header>

      {/* Main Container */}
      <div className="w-full flex flex-col flex-1 items-center sm:p-4 overflow-hidden relative">
        <ChatInterface />
      </div>
    </main>
  );
}
