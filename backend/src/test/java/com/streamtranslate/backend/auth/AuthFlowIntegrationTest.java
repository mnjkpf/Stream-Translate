package com.streamtranslate.backend.auth;

import static org.hamcrest.Matchers.hasSize;
import static org.mockito.Mockito.when;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.context.annotation.Import;
import org.springframework.http.MediaType;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.request.MockMvcRequestBuilders;
import org.springframework.test.web.servlet.result.MockMvcResultMatchers;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.streamtranslate.backend.TestcontainersConfiguration;
import com.streamtranslate.backend.auth.dto.GoogleLoginRequest;
import com.streamtranslate.backend.auth.dto.TokenResponse;
import com.streamtranslate.backend.auth.google.GoogleTokenVerifier;
import com.streamtranslate.backend.auth.google.GoogleUser;
import com.streamtranslate.backend.savewords.dto.WordRequest;

// Мокаємо GoogleTokenVerifier, щоб не ходити в реальний Google JWKS: POST /auth/google має довіряти
// лише тому, що verify() поверне, а не реальному мережевому виклику.
@SpringBootTest
@AutoConfigureMockMvc
@Import(TestcontainersConfiguration.class)
class AuthFlowIntegrationTest {

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private ObjectMapper objectMapper;

    @MockitoBean
    private GoogleTokenVerifier googleTokenVerifier;

    @Test
    void googleLoginThenWordsCrudRoundTrip() throws Exception {
        when(googleTokenVerifier.verify("fake-google-id-token"))
                .thenReturn(new GoogleUser("google-sub-1", "user@example.com", "Test User"));

        String loginBody = mockMvc.perform(MockMvcRequestBuilders.post("/auth/google")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(new GoogleLoginRequest("fake-google-id-token"))))
                .andExpect(MockMvcResultMatchers.status().isOk())
                .andReturn().getResponse().getContentAsString();

        TokenResponse tokens = objectMapper.readValue(loginBody, TokenResponse.class);
        String authHeader = "Bearer " + tokens.accessToken();

        WordRequest wordRequest = new WordRequest(
                "hello", "hello", "noun", "привіт", null, "en", "uk", null, null);

        mockMvc.perform(MockMvcRequestBuilders.post("/words")
                        .header("Authorization", authHeader)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(wordRequest)))
                .andExpect(MockMvcResultMatchers.status().isCreated());

        mockMvc.perform(MockMvcRequestBuilders.get("/words").header("Authorization", authHeader))
                .andExpect(MockMvcResultMatchers.status().isOk())
                .andExpect(MockMvcResultMatchers.jsonPath("$", hasSize(1)))
                .andExpect(MockMvcResultMatchers.jsonPath("$[0].lemma").value("hello"));
    }
}
