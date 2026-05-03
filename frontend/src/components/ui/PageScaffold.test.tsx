// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { MetricCard } from './PageScaffold'

describe('MetricCard', () => {
  it('exposes a named button and activates with pointer and keyboard', async () => {
    const user = userEvent.setup()
    const onActivate = vi.fn()

    render(
      <MetricCard
        label="未读通知"
        value={8}
        actionLabel="打开未读通知"
        accent="#2563eb"
        icon={<span aria-hidden="true">N</span>}
        onActivate={onActivate}
      />,
    )

    const card = screen.getByRole('button', { name: '打开未读通知' })
    expect(card).toHaveTextContent('未读通知')
    expect(card).toHaveTextContent('8')

    await user.click(card)
    card.focus()
    await user.keyboard('{Enter}')
    await user.keyboard(' ')

    expect(onActivate).toHaveBeenCalledTimes(3)
  })
})
