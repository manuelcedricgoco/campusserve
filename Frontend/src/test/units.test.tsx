import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { buildAccess, type AccessContext } from '@/lib/access';
import { ApiError } from '@/lib/api';
import { humanize, money } from '@/lib/format';
import { ClearanceLine, QueueTicket } from '@/components/brand/brand';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Status } from '@/components/ui/status';

const base: AccessContext = {
  profile: { id: 'u1', email: 'a@campusserve.test', full_name: 'A', phone: null, is_active: true },
  roles: ['student'], student: null, assignments: [], globalPermissions: [], scopedPermissions: [], academicYear: null,
};

describe('access model', () => {
  it('derives workspaces from the profile, never from the URL', () => {
    const a = buildAccess({
      ...base, roles: ['student', 'administrator'],
      student: { student_number: '1', year_level: 3, section: '3A', program_code: 'BSIT', program_name: 'BSIT', department_organization_id: null, department_organization_code: 'PADC', organization_mapping_status: 'confirmed' },
      assignments: [{ scope_type: 'organization', scope_id: 'org1', scope_code: 'SSG', scope_name: 'SSG', position_code: 'treasurer', position_name: 'Treasurer', academic_year: '2026-2027', program_id: null, section: null }],
    });
    expect(a.workspaces).toEqual(['student', 'organization', 'admin']);
  });

  it('scopes permissions to the organization that granted them', () => {
    const a = buildAccess({
      ...base,
      assignments: [{ scope_type: 'organization', scope_id: 'org1', scope_code: 'SSG', scope_name: 'SSG', position_code: 'treasurer', position_name: 'Treasurer', academic_year: 'x', program_id: null, section: null }],
      scopedPermissions: [{ permission: 'receipts.verify', scopeType: 'organization', scopeId: 'org1' }],
    });
    expect(a.can('receipts.verify')).toBe(true);
    expect(a.canIn('receipts.verify', 'org1')).toBe(true);
    expect(a.canIn('receipts.verify', 'org2')).toBe(false);
    expect(a.scopesWith('receipts.verify').map((s) => s.scope_code)).toEqual(['SSG']);
  });
});

describe('formatting and errors', () => {
  it('formats pesos and humanizes codes', () => {
    expect(money(60)).toMatch(/60\.00/);
    expect(humanize('pending_verification')).toBe('Pending verification');
  });
  it('exposes field errors from a validation response', () => {
    const e = new ApiError(400, 'VALIDATION_FAILED', 'x', [{ path: 'purpose', message: 'Too short' }]);
    expect(e.fieldErrors).toEqual({ purpose: 'Too short' });
  });
});

describe('components', () => {
  it('renders the queue number padded and labelled for screen readers', () => {
    render(<QueueTicket t={{ queue_number: 7, status: 'reserved', service_name: 'Counseling', office_name: 'Guidance', slot_date: '2026-11-27', start_time: '09:00', end_time: '09:30' }} />);
    expect(screen.getByLabelText('Queue number 7')).toHaveTextContent('007');
  });

  it('marks signed, waiting and pending stations with text, not only color', () => {
    render(<ClearanceLine steps={[
      { id: '1', sequence: 1, step_name: 'SSG Governor', status: 'approved', acted_by_name: 'Gov', acted_at: '2026-11-20T01:00:00Z' },
      { id: '2', sequence: 2, step_name: 'SAS Head', status: 'pending', requirements: [{ requirement_key: 'r', name: 'Library slip', status: 'not_satisfied' }] },
      { id: '3', sequence: 3, step_name: 'Program Head', status: 'pending' },
    ]} />);
    expect(screen.getByText(': signed')).toBeInTheDocument();
    expect(screen.getByText(': waiting for signature')).toBeInTheDocument();
    expect(screen.getByText('Library slip')).toBeInTheDocument();
    expect(screen.getByText(/Signed by Gov/)).toBeInTheDocument();
  });

  it('wires labels and errors to inputs', () => {
    render(<Field label="Purpose" error="Say briefly what this is for."><Input /></Field>);
    const input = screen.getByLabelText('Purpose');
    expect(input).toHaveAttribute('aria-invalid', 'true');
    expect(input.getAttribute('aria-describedby')).toBeTruthy();
    expect(screen.getByRole('alert')).toHaveTextContent('Say briefly');
  });

  it('shows readable status labels', () => {
    render(<Status value="pending_verification" />);
    expect(screen.getByText('Pending verification')).toBeInTheDocument();
  });
});
