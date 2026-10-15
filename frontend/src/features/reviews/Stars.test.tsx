import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { describe, expect, it } from 'vitest'
import { StarInput } from './Stars'

function Harness() {
  const [value, setValue] = useState(0)
  return (
    <>
      <span id="lbl">Chọn mức đánh giá</span>
      <StarInput value={value} onChange={setValue} labelledBy="lbl" />
    </>
  )
}

describe('StarInput', () => {
  it('bấm vào sao để chọn, chỉ một sao được chọn', async () => {
    const user = userEvent.setup()
    render(<Harness />)

    await user.click(screen.getByRole('radio', { name: '4 sao' }))

    expect(screen.getByRole('radio', { name: '4 sao' })).toBeChecked()
    expect(screen.getByRole('radio', { name: '5 sao' })).not.toBeChecked()
  })

  it('dùng phím mũi tên để đổi số sao và không vượt quá 1–5', async () => {
    const user = userEvent.setup()
    render(<Harness />)

    await user.tab()
    await user.keyboard('{ArrowRight}')
    expect(screen.getByRole('radio', { name: '1 sao' })).toBeChecked()

    await user.keyboard('{ArrowRight}{ArrowRight}')
    expect(screen.getByRole('radio', { name: '3 sao' })).toBeChecked()

    await user.keyboard('{ArrowLeft}{ArrowLeft}{ArrowLeft}')
    expect(screen.getByRole('radio', { name: '1 sao' })).toBeChecked()
  })
})
