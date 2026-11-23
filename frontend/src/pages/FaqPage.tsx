import { useSearchParams } from 'react-router'
import FaqView from '../components/support/FaqView.tsx'
import { FAQ_ITEMS } from '../support/faq.ts'

/** S04 FAQ(`/support/faq`, 비회원도 열람). 검색어는 이 화면 전용으로 주소(`?q=`)에 보관한다(공지 검색어와 섞이지 않는다). */
export default function FaqPage() {
  const [params, setParams] = useSearchParams()
  const query = params.get('q') ?? ''
  return (
    <FaqView
      items={FAQ_ITEMS}
      query={query}
      onQueryChange={(value) =>
        setParams(value === '' ? {} : { q: value }, { replace: true })
      }
    />
  )
}
