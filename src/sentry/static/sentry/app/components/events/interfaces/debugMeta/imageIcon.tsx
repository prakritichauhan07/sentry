import styled from '@emotion/styled';

import space from 'app/styles/space';
import InlineSvg from 'app/components/inlineSvg';

const ImageIcon = styled(InlineSvg)<{type: 'muted' | 'success' | 'error'}>`
  font-size: ${p => p.theme.fontSizeLarge};
  color: ${p => p.theme.alert[p.type].iconColor};
  @media (max-width: ${p => p.theme.breakpoints[0]}) {
    font-size: ${p => p.theme.fontSizeExtraLarge};
    margin-bottom: ${space(0.5)};
  }
`;

export default ImageIcon;
